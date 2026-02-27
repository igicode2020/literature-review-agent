"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageSquare,
  FileText,
  ChevronDown,
  ChevronRight,
  Trash2,
  Loader2,
  LogOut,
  User,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import PaperManager from "./PaperManager";

interface ConversationSummary {
  _id: string;
  topic: string;
  paperCount: number;
  createdAt: string;
}

interface UploadedPaper {
  _id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

interface UserInfo {
  id: string;
  name: string;
  email: string;
}

interface SidebarProps {
  user: UserInfo | null;
  onSelectConversation: (id: string) => void;
  onNewReview: () => void;
  activeConversationId: string | null;
}

export default function Sidebar({
  user,
  onSelectConversation,
  onNewReview,
  activeConversationId,
}: SidebarProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [papers, setPapers] = useState<UploadedPaper[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [papersOpen, setPapersOpen] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const fetchPapers = useCallback(async () => {
    try {
      const res = await fetch("/api/papers");
      if (res.ok) {
        const data = await res.json();
        setPapers(data.papers || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    fetchPapers();
  }, [fetchConversations, fetchPapers]);

  // Expose refresh function for after a new review is saved
  useEffect(() => {
    const handler = () => {
      fetchConversations();
    };
    window.addEventListener("conversation-saved", handler);
    return () => window.removeEventListener("conversation-saved", handler);
  }, [fetchConversations]);

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c._id !== id));
        if (activeConversationId === id) {
          onNewReview();
        }
      }
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year:
        d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  };

  return (
    <div className="flex flex-col h-full bg-card/50">
      {/* New review button */}
      <div className="p-3 border-b border-border">
        <button
          onClick={onNewReview}
          className={cn(
            "w-full flex items-center justify-center gap-2",
            "px-3 py-2.5 rounded-lg",
            "bg-primary text-primary-foreground",
            "hover:bg-primary/90 transition-colors",
            "text-sm font-medium"
          )}
        >
          <Plus className="h-4 w-4" />
          New Review
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* History section */}
        <div className="border-b border-border">
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/50"
          >
            {historyOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <MessageSquare className="h-3 w-3" />
            History
            {conversations.length > 0 && (
              <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
                {conversations.length}
              </span>
            )}
          </button>

          {historyOpen && (
            <div className="pb-2 px-2">
              {loadingConversations ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                  No reviews yet
                </p>
              ) : (
                <div className="space-y-0.5">
                  {conversations.map((conv) => (
                    <button
                      key={conv._id}
                      onClick={() => onSelectConversation(conv._id)}
                      className={cn(
                        "w-full flex items-start gap-2 px-2.5 py-2 rounded-md text-left group",
                        "hover:bg-muted/80 transition-colors",
                        activeConversationId === conv._id &&
                          "bg-primary/10 border border-primary/20"
                      )}
                    >
                      <FileText className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {conv.topic}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {conv.paperCount} papers &middot;{" "}
                          {formatDate(conv.createdAt)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleDeleteConversation(conv._id, e)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                      >
                        {deletingId === conv._id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Papers section */}
        <div className="border-b border-border">
          <button
            onClick={() => setPapersOpen(!papersOpen)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/50"
          >
            {papersOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <FileText className="h-3 w-3" />
            My Papers
            {papers.length > 0 && (
              <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
                {papers.length}/5
              </span>
            )}
          </button>

          {papersOpen && (
            <div className="pb-3 px-3">
              <PaperManager papers={papers} onRefresh={fetchPapers} />
            </div>
          )}
        </div>
      </div>

      {/* User footer */}
      {user && (
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {user.name}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
