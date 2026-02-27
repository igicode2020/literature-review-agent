"use client";

import { useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
  Copy,
  Download,
  FileText,
  Clock,
  BookOpen,
  Loader2,
  X,
  ArrowDownToLine,
  AlertCircle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ReviewPanelProps {
  content: string;
  isComplete: boolean;
  isRunning: boolean;
  paperCount: number;
  elapsedSeconds: number;
}

interface CitationAnalysis {
  analysis: string;
  paperFilename: string;
}

export default function ReviewPanel({
  content,
  isComplete,
  isRunning,
  paperCount,
  elapsedSeconds,
}: ReviewPanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [citationAnalysis, setCitationAnalysis] =
    useState<CitationAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);

  const formatElapsed = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return mins > 0 ? `${mins}m ${s}s` : `${s}s`;
  };

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
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

  /* ---- Drag-and-drop handlers ---- */

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!content) return; // No review to analyze against
      if (e.dataTransfer.types.includes("application/paper")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
      }
    },
    [content]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only hide when actually leaving the container (not entering a child)
    if (
      e.currentTarget &&
      !e.currentTarget.contains(e.relatedTarget as Node)
    ) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      if (!content) return;

      const raw = e.dataTransfer.getData("application/paper");
      if (!raw) return;

      let paperData: { _id: string; filename: string };
      try {
        paperData = JSON.parse(raw);
      } catch {
        return;
      }

      // Trigger citation analysis
      setAnalysisLoading(true);
      setAnalysisError("");
      setCitationAnalysis(null);
      setAnalysisPanelOpen(true);

      try {
        const res = await fetch("/api/review/analyze-citations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paperId: paperData._id,
            reviewContent: content,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setAnalysisError(data.error || "Analysis failed");
        } else {
          setCitationAnalysis(data);
        }
      } catch {
        setAnalysisError("Failed to connect. Please try again.");
      } finally {
        setAnalysisLoading(false);
      }
    },
    [content]
  );

  return (
    <div
      className="flex flex-col h-full relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-30 bg-primary/5 border-2 border-dashed border-primary/40 rounded-lg flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-primary">
            <ArrowDownToLine className="h-8 w-8 animate-bounce" />
            <p className="text-sm font-medium">
              Drop paper to analyze citations
            </p>
            <p className="text-xs text-primary/70">
              Claude will check citation usage &amp; suggest improvements
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm text-foreground">
            Literature Review
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {citationAnalysis && !analysisPanelOpen && (
            <button
              onClick={() => setAnalysisPanelOpen(true)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium",
                "bg-amber-50 text-amber-700",
                "hover:bg-amber-100 transition-colors",
                "border border-amber-200"
              )}
            >
              <Search className="h-3 w-3" />
              Citation Analysis
            </button>
          )}
          {isComplete && (
            <>
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
            </>
          )}
        </div>
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
          {content && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 ml-auto">
              <ArrowDownToLine className="h-3.5 w-3.5" />
              <span>Drag a paper here to analyze citations</span>
            </div>
          )}
        </div>
      )}

      {/* Content area — split when analysis panel is open */}
      <div className="flex-1 flex min-h-0">
        {/* Main review content */}
        <div
          ref={contentRef}
          className={cn(
            "flex-1 overflow-y-auto custom-scrollbar p-6",
            analysisPanelOpen && "border-r border-border"
          )}
        >
          {!content && !isRunning ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileText className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">No review yet</p>
              <p className="text-xs mt-1 text-center max-w-sm">
                Enter a research topic and click &quot;Start Review&quot; to
                generate a comprehensive literature review with citations.
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

        {/* Citation analysis side panel */}
        {analysisPanelOpen && (
          <div className="w-[380px] min-w-[300px] flex flex-col bg-amber-50/30">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200/50 bg-amber-50/60">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-amber-600" />
                <h3 className="font-semibold text-sm text-amber-900">
                  Citation Analysis
                </h3>
              </div>
              <button
                onClick={() => setAnalysisPanelOpen(false)}
                className="p-1 rounded hover:bg-amber-100 text-amber-500 hover:text-amber-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
              {analysisLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-amber-700">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <p className="text-sm font-medium">
                    Analyzing citations...
                  </p>
                  <p className="text-xs text-amber-600 text-center max-w-[250px]">
                    Claude is reading through the paper and comparing citations
                    with your literature review
                  </p>
                </div>
              ) : analysisError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-destructive">
                  <AlertCircle className="h-6 w-6" />
                  <p className="text-sm font-medium">Analysis Failed</p>
                  <p className="text-xs text-center max-w-[250px]">
                    {analysisError}
                  </p>
                </div>
              ) : citationAnalysis ? (
                <div>
                  <div className="mb-3 px-3 py-2 rounded-lg bg-amber-100/60 border border-amber-200/60">
                    <p className="text-xs text-amber-800">
                      Analyzed against:{" "}
                      <span className="font-semibold">
                        {citationAnalysis.paperFilename}
                      </span>
                    </p>
                  </div>
                  <div className="prose prose-sm max-w-none prose-headings:text-amber-900 prose-p:text-amber-950/80 prose-li:text-amber-950/80 prose-strong:text-amber-900">
                    <ReactMarkdown>
                      {citationAnalysis.analysis}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
