"""Dual-Mode LLM Router — Component 4.

Implements Novel Contribution #2 (Privacy Shield for Cloud LLMs).

Routes NL→SQL calls to either:
  - Cloud API (Llama 3 / Mistral via OpenAI-compatible endpoint)
  - Local Ollama instance (Mistral 7B / SQLCoder-7B-2)

Privacy Shield is invoked by the caller (generate route) before cloud calls;
this router itself just dispatches the HTTP request.
"""

from __future__ import annotations

import asyncio
import json
from typing import Optional

import httpx
from loguru import logger

from config import Settings


class LLMResponse:
    def __init__(self, text: str, mode: str, error: Optional[str] = None):
        self.text = text
        self.mode = mode  # 'cloud' or 'local'
        self.error = error


class LLMRouter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._cloud_client = httpx.AsyncClient(timeout=settings.llm_timeout_seconds)
        self._local_client = httpx.AsyncClient(timeout=settings.llm_timeout_seconds)

    def should_use_cloud(self, mode_override: Optional[str] = None) -> bool:
        mode = mode_override or self.settings.llm_mode
        if mode == 'cloud':
            return True
        if mode == 'local':
            return False
        # auto — prefer cloud, fallback to local on failure
        return True

    async def complete(self, system_prompt: str, user_prompt: str,
                       use_cloud: bool = True) -> LLMResponse:
        if use_cloud:
            resp = await self._call_cloud(system_prompt, user_prompt)
            if resp.error and self.settings.llm_mode == 'auto':
                logger.warning(f'Cloud LLM failed ({resp.error}); falling back to local.')
                local = await self._call_local(system_prompt, user_prompt)
                return local
            return resp
        return await self._call_local(system_prompt, user_prompt)

    async def _call_cloud(self, system_prompt: str, user_prompt: str) -> LLMResponse:
        api_key = self.settings.cloud_api_key or ''
        try:
            resp = await self._cloud_client.post(
                self.settings.cloud_endpoint,
                headers={'Authorization': f'Bearer {api_key}'},
                json={
                    'model': self.settings.cloud_model,
                    'messages': [
                        {'role': 'system', 'content': system_prompt},
                        {'role': 'user', 'content': user_prompt},
                    ],
                    'temperature': 0.1,
                    'max_tokens': 1024,
                },
            )
            if resp.status_code == 401:
                return LLMResponse('', 'cloud', error='Invalid API key (HTTP 401)')
            if resp.status_code == 429:
                return LLMResponse('', 'cloud', error='Rate limited (HTTP 429)')
            if resp.status_code != 200:
                return LLMResponse('', 'cloud', error=f'HTTP {resp.status_code}: {resp.text[:200]}')

            data = resp.json()
            text = data['choices'][0]['message']['content'].strip()
            return LLMResponse(text, 'cloud')

        except httpx.TimeoutException:
            return LLMResponse('', 'cloud', error='Cloud LLM timed out')
        except Exception as exc:
            return LLMResponse('', 'cloud', error=str(exc))

    async def _call_local(self, system_prompt: str, user_prompt: str) -> LLMResponse:
        try:
            full_prompt = f'{system_prompt}\n\n{user_prompt}'
            resp = await self._local_client.post(
                self.settings.local_endpoint,
                json={
                    'model': self.settings.local_model,
                    'prompt': full_prompt,
                    'stream': False,
                    'options': {'temperature': 0.1, 'num_predict': 1024},
                },
            )
            if resp.status_code != 200:
                return LLMResponse('', 'local', error=f'Ollama HTTP {resp.status_code}')
            data = resp.json()
            return LLMResponse(data.get('response', '').strip(), 'local')

        except httpx.TimeoutException:
            return LLMResponse('', 'local', error='Ollama timed out')
        except Exception as exc:
            return LLMResponse('', 'local', error=str(exc))

    async def close(self) -> None:
        await self._cloud_client.aclose()
        await self._local_client.aclose()
