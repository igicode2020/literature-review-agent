"use client";

import { useRef, useState, useCallback, useMemo, useEffect } from "react";
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
  CheckCircle2,
  ArrowLeft,
  Lightbulb,
  MessageSquareWarning,
  ShieldCheck,
  Sparkles,
  BookMarked,
  FlaskConical,
  Eye,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ReviewPanelProps {
  content: string;
  isComplete: boolean;
  isRunning: boolean;
  paperCount: number;
  elapsedSeconds: number;
}

interface Annotation {
  quote: string;
  comment: string;
  type:
    | "citation"
    | "accuracy"
    | "clarity"
    | "methodology"
    | "missing-citation"
    | "strength";
}

interface DroppedPaper {
  id: string;
  filename: string;
  text: string;
}

type TextSegment =
  | { kind: "plain"; text: string }
  | { kind: "highlight"; text: string; annotation: Annotation; index: number };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const TYPE_CONFIG: Record<
  Annotation["type"],
  { label: string; color: string; bg: string; border: string; icon: typeof AlertCircle }
> = {
  citation: {
    label: "Citation",
    color: "text-amber-700",
    bg: "bg-amber-100/70",
    border: "border-amber-300",
    icon: BookMarked,
  },
  accuracy: {
    label: "Accuracy",
    color: "text-red-700",
    bg: "bg-red-100/70",
    border: "border-red-300",
    icon: AlertCircle,
  },
  clarity: {
    label: "Clarity",
    color: "text-blue-700",
    bg: "bg-blue-100/70",
    border: "border-blue-300",
    icon: Eye,
  },
  methodology: {
    label: "Methodology",
    color: "text-purple-700",
    bg: "bg-purple-100/70",
    border: "border-purple-300",
    icon: FlaskConical,
  },
  "missing-citation": {
    label: "Needs Citation",
    color: "text-orange-700",
    bg: "bg-orange-100/70",
    border: "border-orange-300",
    icon: MessageSquareWarning,
  },
  strength: {
    label: "Strength",
    color: "text-emerald-700",
    bg: "bg-emerald-100/70",
    border: "border-emerald-300",
    icon: CheckCircle2,
  },
};

/** Normalize whitespace for fuzzy matching */
function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Find a quote in text with fuzzy whitespace matching. Returns [start, end] or null. */
function findQuote(
  text: string,
  quote: string
): [number, number] | null {
  // Direct search first
  const idx = text.indexOf(quote);
  if (idx !== -1) return [idx, idx + quote.length];

  // Normalized search
  const normText = normalize(text);
  const normQuote = normalize(quote);
  const normIdx = normText.indexOf(normQuote);
  if (normIdx === -1) return null;

  // Map normalized index back to original: count non-collapsed characters
  let origStart = 0;
  let normPos = 0;
  while (normPos < normIdx && origStart < text.length) {
    const ch = text[origStart];
    if (/\s/.test(ch)) {
      // In normalized text, consecutive whitespace is collapsed to one space
      const start = origStart;
      while (origStart < text.length && /\s/.test(text[origStart])) origStart++;
      if (start < origStart) normPos++; // collapsed to one space
    } else {
      origStart++;
      normPos++;
    }
  }

  // Find the end similarly
  let origEnd = origStart;
  let matchLen = 0;
  while (matchLen < normQuote.length && origEnd < text.length) {
    const ch = text[origEnd];
    if (/\s/.test(ch)) {
      const start = origEnd;
      while (origEnd < text.length && /\s/.test(text[origEnd])) origEnd++;
      if (start < origEnd) matchLen++; // one space in normalized
    } else {
      origEnd++;
      matchLen++;
    }
  }

  return [origStart, origEnd];
}

/** Build highlighted text segments from text + annotations */
function buildSegments(
  text: string,
  annotations: Annotation[]
): TextSegment[] {
  // Find positions for each annotation
  const ranges: { start: number; end: number; annotation: Annotation; index: number }[] = [];

  annotations.forEach((ann, i) => {
    const pos = findQuote(text, ann.quote);
    if (pos) {
      ranges.push({ start: pos[0], end: pos[1], annotation: ann, index: i });
    }
  });

  // Sort by start position and remove overlaps
  ranges.sort((a, b) => a.start - b.start);
  const filtered: typeof ranges = [];
  let lastEnd = 0;
  for (const r of ranges) {
    if (r.start >= lastEnd) {
      filtered.push(r);
      lastEnd = r.end;
    }
  }

  // Build segments
  const segments: TextSegment[] = [];
  let pos = 0;
  for (const r of filtered) {
    if (r.start > pos) {
      segments.push({ kind: "plain", text: text.slice(pos, r.start) });
    }
    segments.push({
      kind: "highlight",
      text: text.slice(r.start, r.end),
      annotation: r.annotation,
      index: r.index,
    });
    pos = r.end;
  }
  if (pos < text.length) {
    segments.push({ kind: "plain", text: text.slice(pos) });
  }

  return segments;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ReviewPanel({
  content,
  isComplete,
  isRunning,
  paperCount,
  elapsedSeconds,
}: ReviewPanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Drag & Drop
  const [isDragOver, setIsDragOver] = useState(false);

  // Paper view mode
  const [droppedPaper, setDroppedPaper] = useState<DroppedPaper | null>(null);
  const [paperLoading, setPaperLoading] = useState(false);
  const [paperError, setPaperError] = useState("");

  // Check / annotation state
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [activeHighlight, setActiveHighlight] = useState<number | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);
  const [isCachedAnalysis, setIsCachedAnalysis] = useState(false);

  const isChecked = annotations.length > 0 || suggestions.length > 0;

  // Memoize segments to avoid re-computation every render
  const segments = useMemo(() => {
    if (!droppedPaper || annotations.length === 0) return null;
    return buildSegments(droppedPaper.text, annotations);
  }, [droppedPaper, annotations]);

  // Annotations that couldn't be matched in the text
  const unmatchedAnnotations = useMemo(() => {
    if (!droppedPaper || annotations.length === 0) return [];
    return annotations.filter((ann) => findQuote(droppedPaper.text, ann.quote) === null);
  }, [droppedPaper, annotations]);

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

  /* ---- Listen for load-analysis events from Sidebar ---- */

  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.paperId || !detail?.paperFilename) return;

      // Reset state
      setAnnotations([]);
      setSuggestions([]);
      setCheckError("");
      setActiveHighlight(null);
      setIsCachedAnalysis(false);

      // Fetch paper text
      setPaperLoading(true);
      setPaperError("");

      try {
        const res = await fetch(`/api/papers/${detail.paperId}/text`);
        const data = await res.json();
        if (!res.ok) {
          setPaperError(data.error || "Failed to load paper text");
        } else {
          setDroppedPaper({
            id: detail.paperId,
            filename: detail.paperFilename,
            text: data.text,
          });

          // Load the cached annotations
          if (detail.annotations && detail.suggestions) {
            setAnnotations(detail.annotations);
            setSuggestions(detail.suggestions);
            setIsCachedAnalysis(true);
            setSuggestionsOpen(true);
          }
        }
      } catch {
        setPaperError("Failed to connect. Please try again.");
      } finally {
        setPaperLoading(false);
      }
    };

    window.addEventListener("load-analysis", handler);
    return () => window.removeEventListener("load-analysis", handler);
  }, []);

  /* ---- Back to review ---- */

  const handleBackToReview = useCallback(() => {
    setDroppedPaper(null);
    setAnnotations([]);
    setSuggestions([]);
    setCheckError("");
    setPaperError("");
    setActiveHighlight(null);
    setIsCachedAnalysis(false);
  }, []);

  /* ---- Drag-and-drop handlers ---- */

  const hasPaperType = useCallback((types: readonly string[]): boolean => {
    return types.includes("application/paper") || types.includes("text/plain");
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (hasPaperType(e.dataTransfer.types)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
      }
    },
    [hasPaperType]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
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

      const raw =
        e.dataTransfer.getData("application/paper") ||
        e.dataTransfer.getData("text/plain");
      if (!raw) return;

      let paperData: { _id: string; filename: string };
      try {
        paperData = JSON.parse(raw);
        if (!paperData._id || !paperData.filename) return;
      } catch {
        return;
      }

      // Reset check state
      setAnnotations([]);
      setSuggestions([]);
      setCheckError("");
      setActiveHighlight(null);
      setIsCachedAnalysis(false);

      // Fetch paper text
      setPaperLoading(true);
      setPaperError("");

      try {
        const [textRes, cacheRes] = await Promise.all([
          fetch(`/api/papers/${paperData._id}/text`),
          fetch(`/api/analyses/by-paper/${paperData._id}`),
        ]);

        const textData = await textRes.json();
        if (!textRes.ok) {
          setPaperError(textData.error || "Failed to load paper text");
        } else {
          setDroppedPaper({
            id: paperData._id,
            filename: paperData.filename,
            text: textData.text,
          });

          // Check if cached analysis exists
          if (cacheRes.ok) {
            const cacheData = await cacheRes.json();
            if (cacheData.found && cacheData.analysis) {
              setAnnotations(cacheData.analysis.annotations || []);
              setSuggestions(cacheData.analysis.suggestions || []);
              setIsCachedAnalysis(true);
              setSuggestionsOpen(true);
            }
          }
        }
      } catch {
        setPaperError("Failed to connect. Please try again.");
      } finally {
        setPaperLoading(false);
      }
    },
    []
  );

  /* ---- Check paper ---- */

  const handleCheck = useCallback(async () => {
    if (!droppedPaper) return;

    setCheckLoading(true);
    setCheckError("");
    setAnnotations([]);
    setSuggestions([]);
    setActiveHighlight(null);
    setSuggestionsOpen(true);
    setIsCachedAnalysis(false);

    try {
      const res = await fetch("/api/review/analyze-citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId: droppedPaper.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCheckError(data.error || "Analysis failed");
      } else {
        const newAnnotations = data.annotations || [];
        const newSuggestions = data.suggestions || [];
        setAnnotations(newAnnotations);
        setSuggestions(newSuggestions);

        // Save analysis to DB for future use
        try {
          await fetch("/api/analyses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paperId: droppedPaper.id,
              paperFilename: droppedPaper.filename,
              annotations: newAnnotations,
              suggestions: newSuggestions,
            }),
          });
          // Notify sidebar to refresh analyses list
          window.dispatchEvent(new Event("analysis-saved"));
        } catch {
          // Don't fail the UI if save fails
        }
      }
    } catch {
      setCheckError("Failed to connect. Please try again.");
    } finally {
      setCheckLoading(false);
    }
  }, [droppedPaper]);

  /* ---- Scroll to highlight ---- */

  const scrollToHighlight = useCallback((index: number) => {
    setActiveHighlight(index);
    const el = document.getElementById(`highlight-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  /* ================================================================ */
  /*  RENDER: Paper View Mode                                         */
  /* ================================================================ */

  if (droppedPaper || paperLoading || paperError) {
    return (
      <div
        className="flex flex-col h-full relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="absolute inset-0 z-30 bg-primary/5 border-2 border-dashed border-primary/40 rounded-lg flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-primary">
              <ArrowDownToLine className="h-8 w-8 animate-bounce" />
              <p className="text-sm font-medium">Drop to switch paper</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <button
              onClick={handleBackToReview}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Back to review"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm text-foreground truncate max-w-[400px]">
              {droppedPaper?.filename || "Loading paper..."}
            </h2>
            {isChecked && (
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border",
                isCachedAnalysis
                  ? "bg-blue-100 text-blue-700 border-blue-200"
                  : "bg-emerald-100 text-emerald-700 border-emerald-200"
              )}>
                {isCachedAnalysis ? (
                  <>
                    <Clock className="h-3 w-3" />
                    Cached
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    Checked
                  </>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {droppedPaper && !checkLoading && (
              <button
                onClick={handleCheck}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold",
                  "bg-primary text-primary-foreground",
                  "hover:bg-primary/90 transition-colors",
                  "shadow-sm"
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isChecked ? "Re-check" : "Check"}
              </button>
            )}
            {checkLoading && (
              <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium bg-primary/80 text-primary-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyzing...
              </div>
            )}
          </div>
        </div>

        {/* Annotation legend bar */}
        {isChecked && (
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 flex-wrap">
            <span className="text-[11px] text-muted-foreground font-medium">
              {annotations.length} comment{annotations.length !== 1 ? "s" : ""}
            </span>
            <div className="h-3 w-px bg-border" />
            {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
              const count = annotations.filter((a) => a.type === key).length;
              if (count === 0) return null;
              return (
                <span
                  key={key}
                  className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium",
                    cfg.bg,
                    cfg.color
                  )}
                >
                  {cfg.label}: {count}
                </span>
              );
            })}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 flex min-h-0">
          {/* Main paper text */}
          <div
            ref={contentRef}
            className={cn(
              "flex-1 overflow-y-auto custom-scrollbar",
              isChecked && "border-r border-border"
            )}
          >
            {paperLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-sm">Extracting paper text...</p>
              </div>
            ) : paperError ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-destructive">
                <AlertCircle className="h-6 w-6" />
                <p className="text-sm font-medium">Could not load paper</p>
                <p className="text-xs text-center max-w-sm">{paperError}</p>
                <button
                  onClick={handleBackToReview}
                  className="mt-2 text-xs text-primary hover:underline"
                >
                  Back to review
                </button>
              </div>
            ) : droppedPaper ? (
              <div className="p-6">
                {checkLoading && (
                  <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-primary">
                    <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                    <p className="text-sm">
                      Claude is reviewing the paper and its citations...
                    </p>
                  </div>
                )}
                {checkError && (
                  <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <p className="text-sm">{checkError}</p>
                  </div>
                )}

                {/* Rendered paper text with highlights */}
                <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap font-[system-ui]">
                  {segments
                    ? segments.map((seg, i) =>
                        seg.kind === "plain" ? (
                          <span key={i}>{seg.text}</span>
                        ) : (
                          <span
                            key={i}
                            id={`highlight-${seg.index}`}
                            onClick={() =>
                              setActiveHighlight(
                                activeHighlight === seg.index
                                  ? null
                                  : seg.index
                              )
                            }
                            className={cn(
                              "relative cursor-pointer rounded-sm px-0.5 -mx-0.5 transition-all",
                              TYPE_CONFIG[seg.annotation.type]?.bg ||
                                "bg-yellow-100",
                              activeHighlight === seg.index &&
                                "ring-2 ring-primary/50",
                              "hover:ring-2 hover:ring-primary/30"
                            )}
                          >
                            {seg.text}
                            <sup
                              className={cn(
                                "ml-0.5 text-[9px] font-bold",
                                TYPE_CONFIG[seg.annotation.type]?.color ||
                                  "text-amber-700"
                              )}
                            >
                              {seg.index + 1}
                            </sup>
                            {/* Inline tooltip on click */}
                            {activeHighlight === seg.index && (
                              <span
                                className={cn(
                                  "absolute z-20 left-0 top-full mt-1",
                                  "w-72 p-3 rounded-lg shadow-lg border",
                                  "bg-white",
                                  TYPE_CONFIG[seg.annotation.type]?.border ||
                                    "border-amber-300"
                                )}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="flex items-center gap-1.5 mb-1.5">
                                  {(() => {
                                    const Icon =
                                      TYPE_CONFIG[seg.annotation.type]?.icon ||
                                      AlertCircle;
                                    return (
                                      <Icon
                                        className={cn(
                                          "h-3.5 w-3.5",
                                          TYPE_CONFIG[seg.annotation.type]
                                            ?.color || "text-amber-700"
                                        )}
                                      />
                                    );
                                  })()}
                                  <span
                                    className={cn(
                                      "text-[10px] font-semibold uppercase tracking-wide",
                                      TYPE_CONFIG[seg.annotation.type]
                                        ?.color || "text-amber-700"
                                    )}
                                  >
                                    {TYPE_CONFIG[seg.annotation.type]?.label ||
                                      seg.annotation.type}
                                  </span>
                                </span>
                                <span className="block text-xs text-foreground/80 leading-relaxed">
                                  {seg.annotation.comment}
                                </span>
                              </span>
                            )}
                          </span>
                        )
                      )
                    : droppedPaper.text}
                </div>

                {/* Unmatched annotations shown as a list below the text */}
                {unmatchedAnnotations.length > 0 && (
                  <div className="mt-6 border-t border-border pt-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                      Additional Comments
                    </h4>
                    <div className="space-y-2">
                      {unmatchedAnnotations.map((ann, i) => {
                        const cfg = TYPE_CONFIG[ann.type] || TYPE_CONFIG.clarity;
                        const Icon = cfg.icon;
                        return (
                          <div
                            key={i}
                            className={cn(
                              "flex gap-2 p-3 rounded-lg border",
                              cfg.bg,
                              cfg.border
                            )}
                          >
                            <Icon
                              className={cn("h-4 w-4 mt-0.5 flex-shrink-0", cfg.color)}
                            />
                            <div>
                              <p className={cn("text-[10px] font-semibold uppercase tracking-wide mb-0.5", cfg.color)}>
                                {cfg.label}
                              </p>
                              <p className="text-xs text-foreground/80 leading-relaxed italic mb-1">
                                &ldquo;{ann.quote}&rdquo;
                              </p>
                              <p className="text-xs text-foreground/80 leading-relaxed">
                                {ann.comment}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            ) : null}
          </div>

          {/* Right sidebar: annotation list */}
          {isChecked && (
            <div className="w-[300px] min-w-[260px] flex flex-col bg-muted/20">
              <div className="px-3 py-2.5 border-b border-border bg-muted/40">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Comments
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {annotations.map((ann, i) => {
                  const cfg = TYPE_CONFIG[ann.type] || TYPE_CONFIG.clarity;
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => scrollToHighlight(i)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors",
                        "hover:bg-muted/60",
                        activeHighlight === i && "bg-primary/5 border-l-2 border-l-primary"
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={cn(
                            "flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white",
                            ann.type === "strength"
                              ? "bg-emerald-500"
                              : ann.type === "accuracy"
                              ? "bg-red-500"
                              : ann.type === "citation"
                              ? "bg-amber-500"
                              : ann.type === "methodology"
                              ? "bg-purple-500"
                              : ann.type === "missing-citation"
                              ? "bg-orange-500"
                              : "bg-blue-500"
                          )}
                        >
                          {i + 1}
                        </span>
                        <Icon className={cn("h-3 w-3", cfg.color)} />
                        <span
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-wide",
                            cfg.color
                          )}
                        >
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 italic">
                        &ldquo;{ann.quote.slice(0, 80)}
                        {ann.quote.length > 80 ? "..." : ""}&rdquo;
                      </p>
                      <p className="text-[11px] text-foreground/70 mt-0.5 line-clamp-2">
                        {ann.comment}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom suggestions panel */}
        {suggestions.length > 0 && (
          <div className="flex-shrink-0 border-t border-amber-200 bg-amber-50/60">
            <button
              onClick={() => setSuggestionsOpen(!suggestionsOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-amber-100/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-semibold text-amber-900">
                  Suggestions
                </span>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 text-[10px] font-bold text-amber-800">
                  {suggestions.length}
                </span>
              </div>
              {suggestionsOpen ? (
                <ChevronDown className="h-4 w-4 text-amber-600" />
              ) : (
                <ChevronRight className="h-4 w-4 text-amber-600" />
              )}
            </button>
            {suggestionsOpen && (
              <div className="px-4 pb-3 max-h-[200px] overflow-y-auto custom-scrollbar">
                <div className="space-y-2">
                  {suggestions.map((suggestion, i) => (
                    <div
                      key={i}
                      className="flex gap-2.5 items-start"
                    >
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-200 border border-amber-300 flex items-center justify-center text-[10px] font-semibold text-amber-800 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm text-amber-950/80 leading-relaxed">
                        {suggestion}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER: Default Review Mode                                      */
  /* ================================================================ */

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
            <p className="text-sm font-medium">Drop paper to review</p>
            <p className="text-xs text-primary/70">
              View the paper &amp; check citations with Claude
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
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 ml-auto">
            <ArrowDownToLine className="h-3.5 w-3.5" />
            <span>Drag a paper here to check citations</span>
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
              Enter a research topic and click &quot;Start Review&quot; to
              generate a comprehensive literature review with citations.
            </p>
            <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
              <ArrowDownToLine className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Or drag a paper from &quot;My Papers&quot; to check its
                citations
              </p>
            </div>
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
