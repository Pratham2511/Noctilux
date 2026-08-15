// ============================================================================
// QueryTreeView.tsx — ReactFlow DAG with fork/compare/merge actions
// Implements Novel Contribution #14 (Interactive Query Tree with Visual Branching).
// ============================================================================
import { useEffect, useState, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeChange,
  applyNodeChanges,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { QueryTree as QueryTreeData, QueryNode } from '../../../src/types';
import { onMessage, postMessage } from '../vscode';

const STATUS_COLOR: Record<QueryNode['status'], string> = {
  success: '#4ec9b0',
  failed: '#f14c4c',
  warning: '#d4a017',
  unexecuted: '#888',
};

export default function QueryTreeView() {
  const [tree, setTree] = useState<QueryTreeData>({ nodes: {}, rootIds: [], checkpoints: [] });
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);

  useEffect(() => {
    postMessage('LOAD_TREE', {});
    const off = onMessage(msg => {
      if (msg.type === 'TREE_UPDATED') {
        setTree(msg.payload as QueryTreeData);
      }
    });
    return off;
  }, []);

  // Convert tree → reactflow nodes/edges
  useEffect(() => {
    const nodes: Node[] = Object.values(tree.nodes).map(node => ({
      id: node.id,
      type: 'default',
      position: computePosition(node, tree),
      data: {
        label: (
          <div className="text-xs">
            <div className="font-semibold truncate max-w-[200px]">{node.nlInput}</div>
            <div className="opacity-60">{node.sql.slice(0, 60)}…</div>
            <div className="flex gap-2 mt-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: STATUS_COLOR[node.status] }}
              />
              {node.executionTimeMs && (
                <span className="opacity-70">{node.executionTimeMs}ms</span>
              )}
              {node.checkpointLabel && (
                <span className="text-qm-accent">📌 {node.checkpointLabel}</span>
              )}
            </div>
          </div>
        ),
      },
      style: { borderColor: STATUS_COLOR[node.status] },
    }));

    const edges: Edge[] = Object.values(tree.nodes)
      .filter(n => n.parentId)
      .map(n => ({
        id: `${n.parentId}->${n.id}`,
        source: n.parentId!,
        target: n.id,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
      }));

    setRfNodes(nodes);
    setRfEdges(edges);
  }, [tree]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setRfNodes(nds => applyNodeChanges(changes, nds)),
    []
  );

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNodeIds(prev => {
      if (prev.includes(node.id)) {
        return prev.filter(id => id !== node.id);
      }
      if (prev.length === 2) {
        return [prev[1], node.id];
      }
      return [...prev, node.id];
    });
  }, []);

  const fork = () => {
    if (selectedNodeIds.length !== 1) return;
    postMessage('NODE_FORKED', {
      parentId: selectedNodeIds[0],
      sql: tree.nodes[selectedNodeIds[0]]?.sql,
    });
  };

  const compare = () => {
    if (selectedNodeIds.length !== 2) return;
    const a = tree.nodes[selectedNodeIds[0]];
    const b = tree.nodes[selectedNodeIds[1]];
    if (!a || !b) return;
    alert(
      `Comparison:\n\n` +
      `Node A: ${a.nlInput}\n  SQL: ${a.sql.slice(0, 100)}\n  ${a.executionTimeMs}ms, ${a.rowCount} rows\n\n` +
      `Node B: ${b.nlInput}\n  SQL: ${b.sql.slice(0, 100)}\n  ${b.executionTimeMs}ms, ${b.rowCount} rows`
    );
  };

  const checkpoint = () => {
    if (selectedNodeIds.length !== 1) return;
    const label = prompt('Checkpoint label:');
    if (!label) return;
    postMessage('NODE_CHECKPOINTED', {
      nodeId: selectedNodeIds[0],
      label,
    });
  };

  return (
    <div className="w-full h-full relative">
      {/* Toolbar */}
      <div className="absolute top-2 left-2 z-10 flex gap-2 bg-[var(--vscode-editorWidget-background)] p-2 rounded border border-qm-border">
        <button
          onClick={fork}
          disabled={selectedNodeIds.length !== 1}
          className="text-xs px-2 py-1 border border-qm-border rounded disabled:opacity-30"
        >
          Fork
        </button>
        <button
          onClick={compare}
          disabled={selectedNodeIds.length !== 2}
          className="text-xs px-2 py-1 border border-qm-border rounded disabled:opacity-30"
        >
          Compare
        </button>
        <button
          onClick={checkpoint}
          disabled={selectedNodeIds.length !== 1}
          className="text-xs px-2 py-1 border border-qm-border rounded disabled:opacity-30"
        >
          Checkpoint
        </button>
        <span className="text-xs opacity-60 ml-2 self-center">
          {selectedNodeIds.length} selected
        </span>
      </div>

      {rfNodes.length === 0 ? (
        <div className="flex items-center justify-center h-full text-xs opacity-60">
          No queries yet — start chatting to build your query tree.
        </div>
      ) : (
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      )}
    </div>
  );
}

function computePosition(node: QueryNode, tree: QueryTreeData): { x: number; y: number } {
  // Simple top-down layout by depth + sibling index
  let depth = 0;
  let current: QueryNode | undefined = node;
  while (current?.parentId) {
    depth++;
    current = tree.nodes[current.parentId];
  }
  const siblingsAtDepth = Object.values(tree.nodes).filter(n => {
    let d = 0;
    let cur: QueryNode | undefined = n;
    while (cur?.parentId) {
      d++;
      cur = tree.nodes[cur.parentId];
    }
    return d === depth;
  });
  const siblingIdx = siblingsAtDepth.findIndex(n => n.id === node.id);
  return {
    x: 100 + siblingIdx * 280,
    y: 80 + depth * 140,
  };
}
