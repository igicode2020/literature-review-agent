"use client";

import { useEffect, useRef } from "react";
import {
  Search,
  FileText,
  AlertTriangle,
  Brain,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface LogEntry {
  type: "status" | "thinking" | "paper" | "error";
  message: string;
  timestamp: number;
}

interface AgentLogProps {
  logs: LogEntry[];
  paperCount: number;
  isRunning: boolean;
}

function getIcon(type: LogEntry["type"]) {
  switch (type) {
    case "status":
      return <Search className="h-3.5 w-3.5 text-primary flex-shrink-0" />;
    case "thinking":
      return <Brain className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />;
    case "paper":
      return <FileText className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />;
    case "error":
      return (
        <AlertTriangle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
      );
  }
}

function formatTime(ts: number, baseTs: number) {
  const elapsed = Math.round((ts - baseTs) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return mins > 0
    ? `${mins}m ${secs.toString().padStart(2, "0")}s`
    : `${secs}s`;
}

export default function AgentLog({ logs, paperCount, isRunning }: AgentLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const baseTimestamp = logs.length > 0 ? logs[0].timestamp : Date.now();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm text-foreground">Agent Activity</h2>
        </div>
        {paperCount > 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium",
              "bg-emerald-50 text-emerald-700 border border-emerald-200"
            )}
          >
            <FileText className="h-3 w-3" />
            {paperCount} paper{paperCount !== 1 ? "s" : ""} found
          </span>
        )}
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1.5"
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Search className="h-8 w-8 mb-3 opacity-30" />
            <p className="text-sm">Agent activity will appear here</p>
            <p className="text-xs mt-1">
              Submit a topic to start the literature review
            </p>
          </div>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2 px-3 py-2 rounded-md text-[13px] leading-relaxed",
                log.type === "error"
                  ? "bg-destructive/5 text-destructive"
                  : log.type === "paper"
                  ? "bg-emerald-50/50"
                  : log.type === "thinking"
                  ? "bg-purple-50/50"
                  : "bg-muted/50"
              )}
            >
              <span className="mt-0.5">{getIcon(log.type)}</span>
              <span className="flex-1 min-w-0">
                <span className="break-words">{log.message}</span>
              </span>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap mt-0.5">
                {formatTime(log.timestamp, baseTimestamp)}
              </span>
            </div>
          ))
        )}

        {/* Live indicator */}
        {isRunning && logs.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 text-[13px] text-muted-foreground">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
              <span
                className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot"
                style={{ animationDelay: "0.3s" }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot"
                style={{ animationDelay: "0.6s" }}
              />
            </span>
            Agent is working...
          </div>
        )}
      </div>

      {/* Footer with status */}
      {logs.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border bg-muted/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isRunning ? (
              <>
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span>Agent is running...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Complete</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
