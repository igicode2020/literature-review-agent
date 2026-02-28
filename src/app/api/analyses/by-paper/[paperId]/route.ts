import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getAuthFromCookies } from "@/lib/auth";

// GET /api/analyses/by-paper/[paperId] — get cached analysis for a specific paper
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  const auth = await getAuthFromCookies();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paperId } = await params;

  const db = await getDb();
  const analysis = await db.collection("paper_analyses").findOne(
    { userId: auth.userId, paperId },
    { sort: { updatedAt: -1 } }
  );

  if (!analysis) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    analysis: {
      _id: analysis._id,
      annotations: analysis.annotations,
      suggestions: analysis.suggestions,
      ethicalScore: analysis.ethicalScore ?? null,
      createdAt: analysis.createdAt,
      updatedAt: analysis.updatedAt,
    },
  });
}
