"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  Activity,
  Zap,
  TrendingUp,
  Clock,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
}

interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
}

interface ApiKey {
  _id: string;
  name: string;
  key?: string; // only present on creation
  keyPreview: string;
  totalTokens: number;
  requestCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

interface DailyApiKeyUsage {
  date: string;
  apiKeyId: string;
  totalTokens: number;
}

interface ApiKeyUsageSummary {
  _id: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function UsagePanel() {
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [totals, setTotals] = useState<UsageTotals>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    requestCount: 0,
  });
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiKeyUsage, setApiKeyUsage] = useState<ApiKeyUsageSummary[]>([]);
  const [dailyApiKeyUsage, setDailyApiKeyUsage] = useState<DailyApiKeyUsage[]>(
    []
  );
  const [days, setDays] = useState(30);
  const [selectedApiKey, setSelectedApiKey] = useState<string>("all");
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"tokens" | "api-keys" | "api-usage">("tokens");

  /* ---- Data fetching ---- */

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch(`/api/usage?days=${days}`);
      if (!res.ok) return;
      const data = await res.json();
      setDailyUsage(data.dailyUsage || []);
      setTotals(data.totals || { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 });
      setApiKeyUsage(data.byApiKey || []);
      setDailyApiKeyUsage(data.dailyByApiKey || []);
    } catch {
      // ignore
    }
  }, [days]);

  const fetchApiKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/api-keys");
      if (!res.ok) return;
      const data = await res.json();
      setApiKeys(data.keys || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchUsage(), fetchApiKeys()]).finally(() =>
      setLoading(false)
    );
  }, [fetchUsage, fetchApiKeys]);

  /* ---- Actions ---- */

  const createApiKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to create key");
        return;
      }
      const data = await res.json();
      setCreatedKey(data.key);
      setNewKeyName("");
      fetchApiKeys();
    } catch {
      alert("Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  const deleteApiKey = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        setApiKeys((prev) => prev.filter((k) => k._id !== id));
        if (selectedApiKey === id) setSelectedApiKey("all");
      }
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  /* ---- Derived data for API usage graph ---- */

  const apiUsageChartData = (() => {
    if (selectedApiKey === "all") {
      // Show total daily usage
      return dailyUsage.map((d) => ({
        date: d.date,
        tokens: d.totalTokens,
      }));
    }
    // Filter daily API key usage for the selected key
    return dailyApiKeyUsage
      .filter((d) => d.apiKeyId === selectedApiKey)
      .map((d) => ({
        date: d.date,
        tokens: d.totalTokens,
      }));
  })();

  /* ---- Format helpers ---- */

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatFullDate = (dateStr: string) => {
    if (!dateStr) return "Never";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  /* ---- Custom tooltip ---- */

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ value: number; name: string; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-xs">
        <p className="font-medium text-foreground mb-1">
          {label ? formatDate(label) : ""}
        </p>
        {payload.map((p, i) => (
          <p key={i} className="text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: p.color }} />
            {p.name}: {formatTokens(p.value)}
          </p>
        ))}
      </div>
    );
  };

  /* ---- Render ---- */

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold text-foreground">Usage & API Keys</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor your token consumption and manage API keys
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground font-medium">Total Tokens</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatTokens(totals.totalTokens)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground font-medium">Input Tokens</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatTokens(totals.inputTokens)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground font-medium">Output Tokens</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatTokens(totals.outputTokens)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground font-medium">Requests</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{totals.requestCount}</p>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
          {(
            [
              { key: "tokens", label: "Token Usage" },
              { key: "api-keys", label: "API Keys" },
              { key: "api-usage", label: "API Usage" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                activeTab === tab.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ---- Token Usage Tab ---- */}
        {activeTab === "tokens" && (
          <div className="space-y-4">
            {/* Time range selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Period:</span>
              {[7, 14, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    days === d
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>

            {/* Token usage chart */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Token Usage Over Time
              </h3>
              {dailyUsage.length === 0 ? (
                <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
                  No usage data yet. Run a literature review to see usage here.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={dailyUsage}>
                    <defs>
                      <linearGradient id="colorInput" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(220, 70%, 50%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(220, 70%, 50%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      tick={{ fontSize: 11, fill: "hsl(220, 9%, 46%)" }}
                      axisLine={{ stroke: "hsl(220, 13%, 91%)" }}
                    />
                    <YAxis
                      tickFormatter={formatTokens}
                      tick={{ fontSize: 11, fill: "hsl(220, 9%, 46%)" }}
                      axisLine={{ stroke: "hsl(220, 13%, 91%)" }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: "12px" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="inputTokens"
                      name="Input Tokens"
                      stroke="hsl(220, 70%, 50%)"
                      fill="url(#colorInput)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="outputTokens"
                      name="Output Tokens"
                      stroke="hsl(142, 71%, 45%)"
                      fill="url(#colorOutput)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Requests per day bar chart */}
            {dailyUsage.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Requests Per Day
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyUsage}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      tick={{ fontSize: 11, fill: "hsl(220, 9%, 46%)" }}
                      axisLine={{ stroke: "hsl(220, 13%, 91%)" }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "hsl(220, 9%, 46%)" }}
                      axisLine={{ stroke: "hsl(220, 13%, 91%)" }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="requestCount"
                      name="Requests"
                      fill="hsl(220, 70%, 50%)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ---- API Keys Tab ---- */}
        {activeTab === "api-keys" && (
          <div className="space-y-4">
            {/* Create new key */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Create New API Key
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                API keys allow programmatic access to the review API. The key is
                only shown once after creation.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Key name (e.g., My Integration)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createApiKey()}
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  maxLength={50}
                />
                <button
                  onClick={createApiKey}
                  disabled={!newKeyName.trim() || creating}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Create
                </button>
              </div>

              {/* Show newly created key */}
              {createdKey && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs font-medium text-green-800 mb-2">
                    API key created! Copy it now — it won&apos;t be shown again.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-white border border-green-300 rounded text-xs font-mono text-green-900 break-all">
                      {createdKey}
                    </code>
                    <button
                      onClick={() => copyToClipboard(createdKey)}
                      className="p-2 rounded-md bg-green-100 hover:bg-green-200 text-green-700 transition-colors"
                    >
                      {copiedKey ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <button
                    onClick={() => setCreatedKey(null)}
                    className="mt-2 text-xs text-green-600 hover:text-green-800 underline"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>

            {/* Existing keys */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Your API Keys
              </h3>
              {apiKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No API keys yet. Create one above to get started.
                </p>
              ) : (
                <div className="space-y-2">
                  {apiKeys.map((key) => (
                    <div
                      key={key._id}
                      className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg group"
                    >
                      <Key className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {key.name}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {key.keyPreview}
                        </p>
                      </div>
                      <div className="text-right mr-2">
                        <p className="text-xs text-muted-foreground">
                          {formatTokens(key.totalTokens || 0)} tokens &middot;{" "}
                          {key.requestCount || 0} requests
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Created {formatFullDate(key.createdAt)}
                          {key.lastUsedAt &&
                            ` · Last used ${formatFullDate(key.lastUsedAt)}`}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteApiKey(key._id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        title="Revoke key"
                      >
                        {deletingId === key._id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Usage instructions */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Using Your API Key
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Include your API key in the <code className="px-1 py-0.5 bg-muted rounded text-[11px]">x-api-key</code> header:
              </p>
              <pre className="px-4 py-3 bg-muted/50 rounded-lg text-xs font-mono text-foreground overflow-x-auto">
{`curl -X POST /api/review \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{"topic": "machine learning in healthcare"}'`}
              </pre>
            </div>
          </div>
        )}

        {/* ---- API Usage Tab ---- */}
        {activeTab === "api-usage" && (
          <div className="space-y-4">
            {/* Filter */}
            <div className="flex items-center gap-3">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">
                Filter by API Key:
              </span>
              <select
                value={selectedApiKey}
                onChange={(e) => setSelectedApiKey(e.target.value)}
                className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="all">All Usage (Total)</option>
                {apiKeys.map((key) => (
                  <option key={key._id} value={key._id}>
                    {key.name} ({key.keyPreview})
                  </option>
                ))}
              </select>

              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Period:</span>
                {[7, 14, 30, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                      days === d
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {/* API usage chart */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                {selectedApiKey === "all"
                  ? "Total API Usage"
                  : `Usage for "${apiKeys.find((k) => k._id === selectedApiKey)?.name || "Key"}"`}
              </h3>
              {apiUsageChartData.length === 0 ? (
                <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
                  {selectedApiKey === "all"
                    ? "No usage data yet."
                    : "No usage recorded for this API key."}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={apiUsageChartData}>
                    <defs>
                      <linearGradient id="colorApi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      tick={{ fontSize: 11, fill: "hsl(220, 9%, 46%)" }}
                      axisLine={{ stroke: "hsl(220, 13%, 91%)" }}
                    />
                    <YAxis
                      tickFormatter={formatTokens}
                      tick={{ fontSize: 11, fill: "hsl(220, 9%, 46%)" }}
                      axisLine={{ stroke: "hsl(220, 13%, 91%)" }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="tokens"
                      name="Tokens"
                      stroke="hsl(262, 83%, 58%)"
                      fill="url(#colorApi)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Per-key breakdown table */}
            {apiKeys.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  Usage by API Key
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">
                          Key Name
                        </th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">
                          Tokens
                        </th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">
                          Requests
                        </th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">
                          Last Used
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiKeys.map((key) => {
                        const usage = apiKeyUsage.find(
                          (u) => u._id === key._id
                        );
                        return (
                          <tr
                            key={key._id}
                            className="border-b border-border/50 hover:bg-muted/30"
                          >
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="font-medium">{key.name}</span>
                                <span className="text-xs text-muted-foreground font-mono">
                                  {key.keyPreview}
                                </span>
                              </div>
                            </td>
                            <td className="text-right py-2.5 px-3 font-mono text-xs">
                              {formatTokens(usage?.totalTokens || key.totalTokens || 0)}
                            </td>
                            <td className="text-right py-2.5 px-3 font-mono text-xs">
                              {usage?.requestCount || key.requestCount || 0}
                            </td>
                            <td className="text-right py-2.5 px-3 text-xs text-muted-foreground">
                              {key.lastUsedAt
                                ? formatFullDate(key.lastUsedAt)
                                : "Never"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
