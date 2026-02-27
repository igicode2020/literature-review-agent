"use client";

import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopicInputProps {
  onSubmit: (topic: string) => void;
  isRunning: boolean;
  onCancel: () => void;
}

const EXAMPLE_TOPICS = [
  "Transformer attention mechanisms in NLP",
  "Large language model hallucination mitigation",
  "Federated learning privacy guarantees",
  "Graph neural networks for drug discovery",
  "Reinforcement learning from human feedback",
];

export default function TopicInput({
  onSubmit,
  isRunning,
  onCancel,
}: TopicInputProps) {
  const [topic, setTopic] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (topic.trim() && !isRunning) {
      onSubmit(topic.trim());
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Enter a research topic, e.g. 'Transformer attention mechanisms in NLP'"
              disabled={isRunning}
              className={cn(
                "w-full pl-12 pr-4 py-3.5 rounded-lg border border-border bg-card",
                "text-foreground placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
                "disabled:opacity-60 disabled:cursor-not-allowed",
                "text-[15px] transition-all duration-200"
              )}
            />
          </div>

          {isRunning ? (
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                "px-6 py-3.5 rounded-lg font-medium text-sm",
                "bg-destructive text-destructive-foreground",
                "hover:bg-destructive/90 transition-colors",
                "flex items-center gap-2"
              )}
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Cancel
            </button>
          ) : (
            <button
              type="submit"
              disabled={!topic.trim()}
              className={cn(
                "px-6 py-3.5 rounded-lg font-medium text-sm",
                "bg-primary text-primary-foreground",
                "hover:bg-primary/90 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "flex items-center gap-2"
              )}
            >
              <Search className="h-4 w-4" />
              Start Review
            </button>
          )}
        </div>
      </form>

      {/* Example topics */}
      {!isRunning && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground py-1">Try:</span>
          {EXAMPLE_TOPICS.map((example) => (
            <button
              key={example}
              onClick={() => setTopic(example)}
              className={cn(
                "text-xs px-3 py-1 rounded-full",
                "bg-secondary text-secondary-foreground",
                "hover:bg-secondary/80 transition-colors",
                "border border-transparent hover:border-border"
              )}
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
