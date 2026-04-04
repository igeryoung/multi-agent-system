import { type ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "@/components/ui/resizable";
import type { RunProjection } from "@/shared/contracts/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Activity, Zap } from "lucide-react";

interface AppShellProps {
  sessionSidebar: ReactNode;
  graphPanel: ReactNode;
  conversationPanel: ReactNode;
  drawerContent: ReactNode | null;
  projection: RunProjection;
  isLive: boolean;
}

const phaseColors: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  planning: "bg-blue-100 text-blue-700",
  dispatching: "bg-indigo-100 text-indigo-700",
  waiting_on_agent: "bg-violet-100 text-violet-700",
  awaiting_approval: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-500"
};

export function AppShell({
  sessionSidebar,
  graphPanel,
  conversationPanel,
  drawerContent,
  projection,
  isLive
}: AppShellProps) {
  return (
    <div className="h-screen flex flex-col bg-zinc-50/50">
      <header className="flex items-center justify-between px-5 py-3 bg-white border-b border-zinc-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground leading-none">
              Signal Atlas
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Multi-agent command workspace
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isLive && (
            <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
              <Activity className="w-3.5 h-3.5 animate-pulse" />
              Live
            </div>
          )}
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider",
              phaseColors[projection.phase] ?? phaseColors.draft
            )}
          >
            {projection.phase.replaceAll("_", " ")}
          </Badge>
          {projection.approval.status === "pending" && (
            <Badge
              variant="secondary"
              className="text-[10px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-700"
            >
              Approval Pending
            </Badge>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {sessionSidebar}
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          <ResizablePanel defaultSize={60} minSize={35}>
            <div className="h-full p-4">
              {graphPanel}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={40} minSize={25}>
            <div className="relative h-full bg-white border-l border-zinc-100">
              {conversationPanel}
              {drawerContent}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
