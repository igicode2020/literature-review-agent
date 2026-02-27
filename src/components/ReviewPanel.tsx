"use client";

import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Copy, Download, FileText, Clock, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReviewPanelProps {
  content: string;
  isComplete: boolean;
  isRunning: boolean;
  paperCount: number;
  elapsedSeconds: number;
}

export default function ReviewPanel({
  content,
  isComplete,
  isRunning,
  paperCount,
  elapsedSeconds,
}: ReviewPanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  const formatElapsed = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return mins > 0 ? `${mins}m ${s}s` : `${s}s`;
  };

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `literature-review-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm text-foreground">
            Literature Review
          </h2>
        </div>

        {isComplete && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyMarkdown}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium",
                "bg-secondary text-secondary-foreground",
                "hover:bg-secondary/80 transition-colors",
                "border border-border"
              )}
            >
              <Copy className="h-3 w-3" />
              Copy Markdown
            </button>
            <button
              onClick={handleDownloadTxt}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium",
                "bg-secondary text-secondary-foreground",
                "hover:bg-secondary/80 transition-colors",
                "border border-border"
              )}
            >
              <Download className="h-3 w-3" />
              Download .txt
            </button>
          </div>
        )}
      </div>

      {/* Completion summary bar */}
      {isComplete && (
        <div className="flex items-center gap-4 px-4 py-2.5 bg-emerald-50 border-b border-emerald-200">
          <div className="flex items-center gap-1.5 text-xs text-emerald-700">
            <FileText className="h-3.5 w-3.5" />
            <span className="font-medium">{paperCount} papers</span>
            <span>analyzed</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-700">
            <Clock className="h-3.5 w-3.5" />
            <span>Completed in {formatElapsed(elapsedSeconds)}</span>
          </div>
        </div>
      )}

      {/* Content area */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto custom-scrollbar p-6"
      >
        {!content && !isRunning ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FileText className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">No review yet</p>
            <p className="text-xs mt-1 text-center max-w-sm">
              Enter a research topic and click &quot;Start Review&quot; to generate a
              comprehensive literature review with citations.
            </p>
          </div>
        ) : !content && isRunning ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className="flex gap-1.5 mb-4">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse-dot" />
              <span
                className="w-2 h-2 rounded-full bg-primary animate-pulse-dot"
                style={{ animationDelay: "0.3s" }}
              />
              <span
                className="w-2 h-2 rounded-full bg-primary animate-pulse-dot"
                style={{ animationDelay: "0.6s" }}
              />
            </div>
            <p className="text-sm">Searching for papers...</p>
            <p className="text-xs mt-1">
              The review will appear here once enough papers are collected
            </p>
          </div>
        ) : (
          <div className="prose max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
            {isRunning && (
              <span className="inline-block w-2 h-5 bg-primary/60 animate-pulse ml-0.5 -mb-1" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
