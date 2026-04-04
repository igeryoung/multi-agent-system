import { useCallback, type ReactNode } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Panel,
  type Node,
  type Edge,
  type NodeTypes,
  type OnNodesChange as OnNodesChangeGeneric,
  type NodeMouseHandler
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AgentNode } from "./agent-node";
import type { AgentNodeData } from "@/lib/adapters";

const nodeTypes: NodeTypes = {
  agentNode: AgentNode
};

interface FlowGraphProps {
  nodes: Node<AgentNodeData>[];
  edges: Edge[];
  onNodesChange?: OnNodesChangeGeneric<Node<AgentNodeData>>;
  onNodeClick?: (nodeId: string) => void;
  extraControls?: ReactNode;
}

export function FlowGraph({ nodes, edges, onNodesChange, onNodeClick, extraControls }: FlowGraphProps) {
  const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  return (
    <div className="w-full h-full min-h-[400px] rounded-xl border border-zinc-100 bg-zinc-50/30 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        minZoom={0.5}
        maxZoom={1.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#e4e4e7" />
        {extraControls && (
          <Panel position="top-left">
            {extraControls}
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
