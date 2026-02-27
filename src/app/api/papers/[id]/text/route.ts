import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getAuthFromCookies } from "@/lib/auth";
import { ObjectId } from "mongodb";
import { extractPaperText } from "@/lib/paper-extract";

/**
 * GET /api/papers/[id]/text — extract plain text from a paper
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthFromCookies();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = await getDb();
  const paper = await db.collection("papers").findOne({
    _id: new ObjectId(id),
    userId: auth.userId,
  });

  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  try {
    const text = await extractPaperText(paper.content, paper.mimeType);

    if (!text || text.trim().length < 30) {
      return NextResponse.json(
        {
          error:
            "Could not extract meaningful text. The file may be image-based.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      text,
      filename: paper.filename,
    });
  } catch (error) {
    console.error("Text extraction error:", error);
    return NextResponse.json(
      { error: "Failed to extract text from the paper" },
      { status: 500 }
    );
  }
}
