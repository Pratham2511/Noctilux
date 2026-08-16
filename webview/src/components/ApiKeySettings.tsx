import { useState } from 'react';

interface VsCodeApi {
    postMessage(msg: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

export function ApiKeySettings() {
    const [geminiKey, setGeminiKey] = useState('');
    const [groqKey,   setGroqKey]   = useState('');
    const [saved,     setSaved]     = useState<string | null>(null);

    const save = (provider: 'gemini' | 'groq', key: string) => {
        if (!key) { return; }
        vscode.postMessage({ type: 'STORE_API_KEY', payload: { provider, key } });
        if (provider === 'gemini') { setGeminiKey(''); }
        else { setGroqKey(''); }
        setSaved(provider);
        setTimeout(() => setSaved(null), 3000);
    };

    const openLink = (url: string) =>
        vscode.postMessage({ type: 'OPEN_EXTERNAL', payload: url });

    return (
        <div className="space-y-4 p-4">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                API Keys
            </h2>
            <p className="text-xs text-gray-400">
                Stored in your OS keychain — never written to any file on disk.
            </p>

            {/* Gemini */}
            <div className="border border-gray-700 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-white">
                        Google Gemini
                        <span className="ml-2 text-xs text-green-400">Recommended · Free</span>
                    </span>
                    <button onClick={() => openLink('https://aistudio.google.com/app/apikey')}
                        className="text-xs text-blue-400 hover:underline">
                        Get free key ↗
                    </button>
                </div>
                <div className="flex gap-2">
                    <input type="password" value={geminiKey}
                        onChange={e => setGeminiKey(e.target.value)}
                        placeholder="Paste your API key — any provider"
                        className="flex-1 bg-gray-900 border border-gray-600 rounded
                                   px-3 py-1.5 text-sm font-mono text-gray-200
                                   focus:border-blue-500 focus:outline-none" />
                    <button onClick={() => save('gemini', geminiKey)}
                        disabled={!geminiKey}
                        className="px-3 py-1.5 rounded text-sm bg-blue-600
                                   hover:bg-blue-700 disabled:opacity-40 transition-colors">
                        {saved === 'gemini' ? '✓ Saved' : 'Save'}
                    </button>
                </div>
            </div>

            {/* Groq */}
            <div className="border border-gray-700 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-white">
                        Groq
                        <span className="ml-2 text-xs text-gray-400">Alternative · Free</span>
                    </span>
                    <button onClick={() => openLink('https://console.groq.com/keys')}
                        className="text-xs text-blue-400 hover:underline">
                        Get free key ↗
                    </button>
                </div>
                <div className="flex gap-2">
                    <input type="password" value={groqKey}
                        onChange={e => setGroqKey(e.target.value)}
                        placeholder="Paste your API key — any provider"
                        className="flex-1 bg-gray-900 border border-gray-600 rounded
                                   px-3 py-1.5 text-sm font-mono text-gray-200
                                   focus:border-blue-500 focus:outline-none" />
                    <button onClick={() => save('groq', groqKey)}
                        disabled={!groqKey}
                        className="px-3 py-1.5 rounded text-sm bg-blue-600
                                   hover:bg-blue-700 disabled:opacity-40 transition-colors">
                        {saved === 'groq' ? '✓ Saved' : 'Save'}
                    </button>
                </div>
            </div>

            <p className="text-xs text-gray-500">
                Change provider: VS Code Settings → Verbis → LLM Provider
            </p>
        </div>
    );
}

export default ApiKeySettings;
