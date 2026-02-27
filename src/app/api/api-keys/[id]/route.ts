import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getAuthFromCookies } from "@/lib/auth";
import { ObjectId } from "mongodb";

/**
 * DELETE /api/api-keys/[id] — revoke an API key
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthFromCookies();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid key ID" }, { status: 400 });
  }

  const db = await getDb();
  const result = await db.collection("api_keys").updateOne(
    { _id: new ObjectId(id), userId: auth.userId },
    { $set: { revoked: true, revokedAt: new Date() } }
  );

  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
