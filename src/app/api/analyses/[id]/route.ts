import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getAuthFromCookies } from "@/lib/auth";
import { ObjectId } from "mongodb";

// GET /api/analyses/[id] — get a specific analysis
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
    return NextResponse.json(
      { error: "Invalid analysis ID" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const analysis = await db.collection("paper_analyses").findOne({
    _id: new ObjectId(id),
    userId: auth.userId,
  });

  if (!analysis) {
    return NextResponse.json(
      { error: "Analysis not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ analysis });
}

// DELETE /api/analyses/[id] — delete a specific analysis
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
    return NextResponse.json(
      { error: "Invalid analysis ID" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const result = await db.collection("paper_analyses").deleteOne({
    _id: new ObjectId(id),
    userId: auth.userId,
  });

  if (result.deletedCount === 0) {
    return NextResponse.json(
      { error: "Analysis not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
