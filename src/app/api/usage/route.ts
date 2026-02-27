import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getAuthFromCookies } from "@/lib/auth";

/**
 * GET /api/usage — get token usage data for the current user
 * Query params:
 *   - days: number of days to look back (default: 30)
 *   - apiKeyId: filter by specific API key (optional)
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthFromCookies();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "30", 10);
  const apiKeyId = searchParams.get("apiKeyId");

  const since = new Date();
  since.setDate(since.getDate() - days);

  const db = await getDb();

  // Build match filter
  const match: Record<string, unknown> = {
    userId: auth.userId,
    createdAt: { $gte: since },
  };
  if (apiKeyId) {
    match.apiKeyId = apiKeyId;
  }

  // Get daily aggregated usage
  const dailyUsage = await db
    .collection("token_usage")
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          inputTokens: { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
          totalTokens: { $sum: "$totalTokens" },
          requestCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  // Get totals
  const totals = await db
    .collection("token_usage")
    .aggregate([
      { $match: { userId: auth.userId, createdAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          inputTokens: { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
          totalTokens: { $sum: "$totalTokens" },
          requestCount: { $sum: 1 },
        },
      },
    ])
    .toArray();

  // Get usage by action type
  const byAction = await db
    .collection("token_usage")
    .aggregate([
      { $match: { userId: auth.userId, createdAt: { $gte: since } } },
      {
        $group: {
          _id: "$action",
          totalTokens: { $sum: "$totalTokens" },
          requestCount: { $sum: 1 },
        },
      },
    ])
    .toArray();

  // Get per-API-key usage
  const byApiKey = await db
    .collection("token_usage")
    .aggregate([
      {
        $match: {
          userId: auth.userId,
          createdAt: { $gte: since },
          apiKeyId: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$apiKeyId",
          totalTokens: { $sum: "$totalTokens" },
          inputTokens: { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
          requestCount: { $sum: 1 },
        },
      },
    ])
    .toArray();

  // Get daily usage per API key for the graph
  const dailyByApiKey = await db
    .collection("token_usage")
    .aggregate([
      {
        $match: {
          userId: auth.userId,
          createdAt: { $gte: since },
          apiKeyId: { $ne: null },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            apiKeyId: "$apiKeyId",
          },
          totalTokens: { $sum: "$totalTokens" },
        },
      },
      { $sort: { "_id.date": 1 } },
    ])
    .toArray();

  return NextResponse.json({
    dailyUsage: dailyUsage.map((d) => ({
      date: d._id,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
      totalTokens: d.totalTokens,
      requestCount: d.requestCount,
    })),
    totals: totals[0] || {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      requestCount: 0,
    },
    byAction,
    byApiKey,
    dailyByApiKey: dailyByApiKey.map((d) => ({
      date: d._id.date,
      apiKeyId: d._id.apiKeyId,
      totalTokens: d.totalTokens,
    })),
  });
}
