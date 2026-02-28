import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getAuthFromCookies } from "@/lib/auth";

// GET /api/analyses — list user's saved analyses
export async function GET() {
  const auth = await getAuthFromCookies();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const analyses = await db
    .collection("paper_analyses")
    .find({ userId: auth.userId })
    .sort({ createdAt: -1 })
    .project({
      paperId: 1,
      paperFilename: 1,
      annotationCount: 1,
      suggestionCount: 1,
      ethicalScore: 1,
      createdAt: 1,
    })
    .toArray();

  return NextResponse.json({ analyses });
}

// POST /api/analyses — save a new analysis
export async function POST(req: NextRequest) {
  const auth = await getAuthFromCookies();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { paperId, paperFilename, annotations, suggestions, ethicalScore } = body;

    if (!paperId || !paperFilename) {
      return NextResponse.json(
        { error: "paperId and paperFilename are required" },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Upsert: replace any existing analysis for this paper by this user
    const result = await db.collection("paper_analyses").findOneAndUpdate(
      { userId: auth.userId, paperId },
      {
        $set: {
          userId: auth.userId,
          paperId,
          paperFilename,
          annotations: annotations || [],
          suggestions: suggestions || [],
          ethicalScore: typeof ethicalScore === "number" ? ethicalScore : null,
          annotationCount: (annotations || []).length,
          suggestionCount: (suggestions || []).length,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    return NextResponse.json(
      { id: result?._id?.toString() },
      { status: 201 }
    );
  } catch (error) {
    console.error("Save analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
