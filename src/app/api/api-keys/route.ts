import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getAuthFromCookies } from "@/lib/auth";
import crypto from "crypto";

/**
 * GET /api/api-keys — list user's API keys
 */
export async function GET() {
  const auth = await getAuthFromCookies();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const keys = await db
    .collection("api_keys")
    .find({ userId: auth.userId, revoked: { $ne: true } })
    .sort({ createdAt: -1 })
    .project({
      name: 1,
      keyPreview: 1,
      totalTokens: 1,
      requestCount: 1,
      lastUsedAt: 1,
      createdAt: 1,
    })
    .toArray();

  return NextResponse.json({ keys });
}

/**
 * POST /api/api-keys — create a new API key
 * Body: { name: string }
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthFromCookies();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let name: string;
  try {
    const body = await req.json();
    name = body.name;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "API key name is required" },
      { status: 400 }
    );
  }

  if (name.trim().length > 50) {
    return NextResponse.json(
      { error: "Name must be 50 characters or less" },
      { status: 400 }
    );
  }

  const db = await getDb();

  // Check user doesn't have more than 10 keys
  const count = await db
    .collection("api_keys")
    .countDocuments({ userId: auth.userId, revoked: { $ne: true } });
  if (count >= 10) {
    return NextResponse.json(
      { error: "Maximum of 10 API keys allowed" },
      { status: 400 }
    );
  }

  // Generate a random API key
  const rawKey = `elr_${crypto.randomBytes(32).toString("hex")}`;
  const keyPreview = `${rawKey.slice(0, 8)}...${rawKey.slice(-4)}`;

  const result = await db.collection("api_keys").insertOne({
    userId: auth.userId,
    name: name.trim(),
    key: rawKey,
    keyPreview,
    totalTokens: 0,
    requestCount: 0,
    lastUsedAt: null,
    revoked: false,
    createdAt: new Date(),
  });

  return NextResponse.json({
    id: result.insertedId.toString(),
    name: name.trim(),
    key: rawKey, // Only returned once at creation!
    keyPreview,
    createdAt: new Date().toISOString(),
  });
}
