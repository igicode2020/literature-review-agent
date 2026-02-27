"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { BookOpen, GraduationCap } from "lucide-react";
import TopicInput from "@/components/TopicInput";
import AgentLog, { LogEntry } from "@/components/AgentLog";
import ReviewPanel from "@/components/ReviewPanel";
import Sidebar from "@/components/Sidebar";

interface UserInfo {
  id: string;
  name: string;
  email: string;
}

export default function Home() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [agentLogs, setAgentLogs] = useState<LogEntry[]>([]);
  const [reviewContent, setReviewContent] = useState("");
  const [paperCount, setPaperCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [currentTopic, setCurrentTopic] = useState("");
  const [viewingHistory, setViewingHistory] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch current user
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  // Elapsed-time timer
  useEffect(() => {
    if (isRunning && startTime) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, startTime]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsRunning(false);
    setAgentLogs((prev) => [
      ...prev,
      { type: "error", message: "Cancelled by user", timestamp: Date.now() },
    ]);
  }, []);

  const resetState = useCallback(() => {
    setAgentLogs([]);
    setReviewContent("");
    setPaperCount(0);
    setIsComplete(false);
    setElapsedSeconds(0);
    setStartTime(null);
    setActiveConversationId(null);
    setCurrentTopic("");
    setViewingHistory(false);
  }, []);

  // Save conversation to DB after completion
  const saveConversation = useCallback(
    async (
      topic: string,
      review: string,
      count: number,
      logs: LogEntry[],
      elapsed: number
    ) => {
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic,
            reviewContent: review,
            paperCount: count,
            agentLogs: logs.map((l) => ({
              type: l.type,
              message: l.message,
              timestamp: l.timestamp,
            })),
            elapsedSeconds: elapsed,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setActiveConversationId(data.id);
          // Notify sidebar
          window.dispatchEvent(new Event("conversation-saved"));
        }
      } catch {
        // ignore save errors
      }
    },
    []
  );

  const handleSubmit = useCallback(
    async (topic: string) => {
      resetState();
      setIsRunning(true);
      setCurrentTopic(topic);
      const now = Date.now();
      setStartTime(now);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      let finalReview = "";
      let finalPaperCount = 0;
      const allLogs: LogEntry[] = [];

      try {
        const response = await fetch("/api/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = await response
            .json()
            .catch(() => ({ error: "Request failed" }));
          throw new Error(err.error || `HTTP ${response.status}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            if (!part.trim()) continue;

            const lines = part.split("\n");
            let eventType = "";
            let eventData = "";

            for (const line of lines) {
              if (line.startsWith("event: ")) eventType = line.slice(7);
              if (line.startsWith("data: ")) eventData = line.slice(6);
            }

            if (!eventType || !eventData) continue;

            let data: string | number | Record<string, unknown>;
            try {
              data = JSON.parse(eventData);
            } catch {
              data = eventData;
            }

            switch (eventType) {
              case "status": {
                const log: LogEntry = {
                  type: "status",
                  message: data as string,
                  timestamp: Date.now(),
                };
                allLogs.push(log);
                setAgentLogs((prev) => [...prev, log]);
                break;
              }

              case "thinking": {
                const log: LogEntry = {
                  type: "thinking",
                  message: data as string,
                  timestamp: Date.now(),
                };
                allLogs.push(log);
                setAgentLogs((prev) => [...prev, log]);
                break;
              }

              case "paper_found": {
                const paper = data as Record<string, unknown>;
                const log: LogEntry = {
                  type: "paper",
                  message: `Found: "${paper.title}" (${paper.year || "n.d."})`,
                  timestamp: Date.now(),
                };
                allLogs.push(log);
                setAgentLogs((prev) => [...prev, log]);
                break;
              }

              case "papers_count":
                finalPaperCount = data as number;
                setPaperCount(data as number);
                break;

              case "review_start": {
                const log: LogEntry = {
                  type: "status",
                  message: "Writing literature review...",
                  timestamp: Date.now(),
                };
                allLogs.push(log);
                setAgentLogs((prev) => [...prev, log]);
                break;
              }

              case "review_chunk":
                finalReview += data as string;
                setReviewContent((prev) => prev + (data as string));
                break;

              case "complete": {
                const completed = data as Record<string, unknown>;
                setIsComplete(true);
                setIsRunning(false);
                if (typeof completed.paperCount === "number") {
                  finalPaperCount = completed.paperCount;
                  setPaperCount(completed.paperCount);
                }
                const log: LogEntry = {
                  type: "status",
                  message: "Literature review complete!",
                  timestamp: Date.now(),
                };
                allLogs.push(log);
                setAgentLogs((prev) => [...prev, log]);

                // Auto-save
                const elapsed = Math.floor((Date.now() - now) / 1000);
                saveConversation(
                  topic,
                  finalReview,
                  finalPaperCount,
                  allLogs,
                  elapsed
                );
                break;
              }

              case "error": {
                const log: LogEntry = {
                  type: "error",
                  message: data as string,
                  timestamp: Date.now(),
                };
                allLogs.push(log);
                setAgentLogs((prev) => [...prev, log]);
                setIsRunning(false);
                break;
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          const log: LogEntry = {
            type: "error",
            message:
              (error as Error).message ||
              "Connection error. Please try again.",
            timestamp: Date.now(),
          };
          allLogs.push(log);
          setAgentLogs((prev) => [...prev, log]);
        }
        setIsRunning(false);
      }
    },
    [resetState, saveConversation]
  );

  // Load a past conversation
  const handleSelectConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      const conv = data.conversation;

      setIsRunning(false);
      setActiveConversationId(id);
      setCurrentTopic(conv.topic);
      setReviewContent(conv.reviewContent || "");
      setPaperCount(conv.paperCount || 0);
      setElapsedSeconds(conv.elapsedSeconds || 0);
      setIsComplete(true);
      setViewingHistory(true);

      const logs: LogEntry[] = (conv.agentLogs || []).map(
        (l: { type: string; message: string; timestamp: number }) => ({
          type: l.type as LogEntry["type"],
          message: l.message,
          timestamp: l.timestamp,
        })
      );
      setAgentLogs(logs);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="min-h-screen h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card flex-shrink-0">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground tracking-tight">
                Ethical 
              </h1>
              <p className="text-xs text-muted-foreground">
                AI-powered autonomous academic literature reviews
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" />
            <span>Powered by Claude + Semantic Scholar + arXiv</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <div className="w-[260px] min-w-[220px] border-r border-border flex-shrink-0">
          <Sidebar
            user={user}
            onSelectConversation={handleSelectConversation}
            onNewReview={resetState}
            activeConversationId={activeConversationId}
          />
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Input section */}
          <div className="border-b border-border bg-card/50 flex-shrink-0">
            <div className="px-6 py-4">
              <TopicInput
                onSubmit={handleSubmit}
                isRunning={isRunning}
                onCancel={handleCancel}
              />
            </div>
          </div>

          {/* Two-panel content */}
          <div className="flex-1 flex min-h-0">
            {/* Left panel: Agent log */}
            <div className="w-[380px] min-w-[300px] border-r border-border flex flex-col bg-card/30">
              <AgentLog
                logs={agentLogs}
                paperCount={paperCount}
                isRunning={isRunning}
              />
            </div>

            {/* Right panel: Review document */}
            <div className="flex-1 flex flex-col bg-white min-w-0">
              <ReviewPanel
                content={reviewContent}
                isComplete={isComplete}
                isRunning={isRunning}
                paperCount={paperCount}
                elapsedSeconds={elapsedSeconds}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
