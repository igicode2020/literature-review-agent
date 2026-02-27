import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getAuthFromCookies } from "@/lib/auth";

// GET /api/conversations — list user's conversations
export async function GET() {
  const auth = await getAuthFromCookies();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const conversations = await db
    .collection("conversations")
    .find({ userId: auth.userId })
    .sort({ createdAt: -1 })
    .project({
      topic: 1,
      paperCount: 1,
      elapsedSeconds: 1,
      createdAt: 1,
    })
    .toArray();

  return NextResponse.json({ conversations });
}

// POST /api/conversations — save a completed review
export async function POST(req: NextRequest) {
  const auth = await getAuthFromCookies();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { topic, reviewContent, paperCount, papers, agentLogs, elapsedSeconds } = body;

    if (!topic || !reviewContent) {
      return NextResponse.json(
        { error: "Topic and reviewContent are required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const result = await db.collection("conversations").insertOne({
      userId: auth.userId,
      topic,
      reviewContent,
      paperCount: paperCount || 0,
      papers: papers || [],
      agentLogs: agentLogs || [],
      elapsedSeconds: elapsedSeconds || 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json(
      { id: result.insertedId.toString() },
      { status: 201 }
    );
  } catch (error) {
    console.error("Save conversation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
