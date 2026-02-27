"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import mammoth from "mammoth";
import {
  Upload,
  FileText,
  Trash2,
  Download,
  Loader2,
  AlertCircle,
  File,
  Eye,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadedPaper {
  _id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

interface PaperManagerProps {
  papers: UploadedPaper[];
  onRefresh: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType === "application/pdf") {
    return <FileText className="h-4 w-4 text-red-500" />;
  }
  return <File className="h-4 w-4 text-blue-500" />;
}

export default function PaperManager({
  papers,
  onRefresh,
}: PaperManagerProps) {
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [previewPaper, setPreviewPaper] = useState<UploadedPaper | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [docxLoading, setDocxLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load and convert .docx when preview opens
  useEffect(() => {
    if (
      !previewPaper ||
      previewPaper.mimeType !==
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      setDocxHtml(null);
      return;
    }

    let cancelled = false;
    setDocxLoading(true);
    setDocxHtml(null);

    (async () => {
      try {
        const res = await fetch(`/api/papers/${previewPaper._id}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const arrayBuffer = await res.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) setDocxHtml(result.value);
      } catch {
        if (!cancelled) setDocxHtml("<p>Failed to load document.</p>");
      } finally {
        if (!cancelled) setDocxLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewPaper]);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError("");
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/papers", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Upload failed");
        } else {
          onRefresh();
        }
      } catch {
        setError("Upload failed. Please try again.");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [onRefresh]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        const res = await fetch(`/api/papers/${id}`, { method: "DELETE" });
        if (res.ok) {
          onRefresh();
        }
      } catch {
        // ignore
      } finally {
        setDeletingId(null);
      }
    },
    [onRefresh]
  );

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Paper list */}
      {papers.length > 0 && (
        <div className="space-y-1.5">
          {papers.map((paper) => (
            <div
              key={paper._id}
              draggable
              onDragStart={(e) => {
                const payload = JSON.stringify({ _id: paper._id, filename: paper.filename });
                e.dataTransfer.setData("text/plain", payload);
                e.dataTransfer.setData("application/paper", payload);
                e.dataTransfer.effectAllowed = "copy";
                // Add a drag image hint
                if (e.currentTarget instanceof HTMLElement) {
                  e.dataTransfer.setDragImage(e.currentTarget, 10, 10);
                }
              }}
              className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/50 group cursor-grab active:cursor-grabbing"
            >
              {getFileIcon(paper.mimeType)}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {paper.filename}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatFileSize(paper.size)}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setPreviewPaper(paper)}
                  className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground"
                  title="View"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <a
                  href={`/api/papers/${paper._id}?dl=1`}
                  className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground"
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                <button
                  onClick={() => handleDelete(paper._id)}
                  disabled={deletingId === paper._id}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  {deletingId === paper._id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleUpload}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading || papers.length >= 5}
        className={cn(
          "w-full flex items-center justify-center gap-2",
          "px-3 py-2 rounded-lg border border-dashed border-border",
          "text-xs text-muted-foreground",
          "hover:bg-muted/50 hover:border-primary/30 hover:text-foreground",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "transition-colors"
        )}
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {uploading
          ? "Uploading..."
          : papers.length >= 5
          ? "Max 5 papers reached"
          : "Upload PDF or DOCX"}
      </button>

      <p className="text-[11px] text-muted-foreground text-center">
        {papers.length}/5 papers &middot; Max 10 MB each
      </p>

      {/* Preview Modal */}
      {previewPaper && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewPaper(null)}
        >
          {/* Blurred backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Modal content */}
          <div
            className="relative z-10 bg-background rounded-xl shadow-2xl border border-border w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                {getFileIcon(previewPaper.mimeType)}
                <span className="text-sm font-medium truncate">
                  {previewPaper.filename}
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {formatFileSize(previewPaper.size)}
                </span>
              </div>
              <button
                onClick={() => setPreviewPaper(null)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto">
              {previewPaper.mimeType === "application/pdf" ? (
                <iframe
                  src={`/api/papers/${previewPaper._id}`}
                  className="w-full h-[70vh]"
                  title={previewPaper.filename}
                />
              ) : previewPaper.mimeType ===
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ? (
                docxLoading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Loading document...</span>
                  </div>
                ) : docxHtml ? (
                  <div
                    className="prose prose-sm max-w-none p-6 dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: docxHtml }}
                  />
                ) : null
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                  <File className="h-12 w-12" />
                  <p className="text-sm">Preview not available for this file type</p>
                  <a
                    href={`/api/papers/${previewPaper._id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    Download to view
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
