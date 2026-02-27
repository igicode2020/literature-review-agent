import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getAuthFromCookies } from "@/lib/auth";

const MAX_PAPERS = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// GET /api/papers — list user's uploaded papers
export async function GET() {
  const auth = await getAuthFromCookies();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const papers = await db
    .collection("papers")
    .find({ userId: auth.userId })
    .sort({ createdAt: -1 })
    .project({ filename: 1, mimeType: 1, size: 1, createdAt: 1 })
    .toArray();

  return NextResponse.json({ papers, limit: MAX_PAPERS });
}

// POST /api/papers — upload a paper
export async function POST(req: NextRequest) {
  const auth = await getAuthFromCookies();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = await getDb();
    const papersCollection = db.collection("papers");

    // Check count limit
    const count = await papersCollection.countDocuments({
      userId: auth.userId,
    });
    if (count >= MAX_PAPERS) {
      return NextResponse.json(
        {
          error: `You can upload a maximum of ${MAX_PAPERS} papers. Delete an existing paper to upload a new one.`,
        },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PDF and DOCX files are allowed" },
        { status: 400 }
      );
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File must be under 10 MB" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await papersCollection.insertOne({
      userId: auth.userId,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      content: buffer,
      createdAt: new Date(),
    });

    return NextResponse.json(
      {
        id: result.insertedId.toString(),
        filename: file.name,
        size: file.size,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
