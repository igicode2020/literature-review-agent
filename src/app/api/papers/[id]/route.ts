import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getAuthFromCookies } from "@/lib/auth";
import { ObjectId } from "mongodb";

// GET /api/papers/[id] — download a paper
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
    return NextResponse.json(
      { error: "Paper not found" },
      { status: 404 }
    );
  }

  const buffer = paper.content.buffer
    ? Buffer.from(paper.content.buffer)
    : Buffer.from(paper.content);

  const disposition = _req.nextUrl.searchParams.get("dl") === "1"
    ? `attachment; filename="${paper.filename}"`
    : `inline; filename="${paper.filename}"`;

  return new Response(buffer, {
    headers: {
      "Content-Type": paper.mimeType,
      "Content-Disposition": disposition,
      "Content-Length": String(buffer.length),
    },
  });
}

// DELETE /api/papers/[id] — delete a paper
export async function DELETE(
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
  const result = await db.collection("papers").deleteOne({
    _id: new ObjectId(id),
    userId: auth.userId,
  });

  if (result.deletedCount === 0) {
    return NextResponse.json(
      { error: "Paper not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
