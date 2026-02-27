import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getAuthFromCookies } from "@/lib/auth";
import { ObjectId } from "mongodb";
import Anthropic from "@anthropic-ai/sdk";
import { extractPaperText } from "@/lib/paper-extract";

export const maxDuration = 60;

/**
 * POST /api/review/analyze-citations
 *
 * Body: { paperId: string }
 *
 * Extracts text from the uploaded paper, then asks Claude to review
 * the paper's citations and writing, returning structured annotations.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthFromCookies();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let paperId: string;

  try {
    const body = await req.json();
    paperId = body.paperId;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!paperId) {
    return NextResponse.json(
      { error: "paperId is required" },
      { status: 400 }
    );
  }

  if (!ObjectId.isValid(paperId)) {
    return NextResponse.json({ error: "Invalid paper ID" }, { status: 400 });
  }

  // Fetch paper from DB
  const db = await getDb();
  const paper = await db.collection("papers").findOne({
    _id: new ObjectId(paperId),
    userId: auth.userId,
  });

  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  // Extract text
  let paperText: string;
  try {
    paperText = await extractPaperText(paper.content, paper.mimeType);
  } catch (error) {
    console.error("Text extraction error:", error);
    return NextResponse.json(
      { error: "Failed to extract text from the paper" },
      { status: 500 }
    );
  }

  if (!paperText || paperText.trim().length < 50) {
    return NextResponse.json(
      {
        error:
          "Could not extract meaningful text from this paper. The PDF may be image-based.",
      },
      { status: 422 }
    );
  }

  // Truncate to keep within input token budget
  const truncated = paperText.substring(0, 35000);

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 15000,
      system: `You are an expert academic peer reviewer. You will be given the full text of a research paper. Your job is to:

1. Analyze the paper's citations — are they used properly? Are any misattributed, incomplete, or used out of context?
2. Identify portions of the text that could be improved — writing clarity, unsupported claims, weak arguments, missing citations, methodology concerns, etc.
3. Provide actionable suggestions.

You MUST respond with valid JSON and NOTHING ELSE. No markdown fences, no extra text.

Return this exact JSON structure:
{
  "annotations": [
    {
      "quote": "exact short quote from the paper (10-40 words that can be found in the text)",
      "comment": "your reviewer comment explaining the issue or suggestion",
      "type": "citation | accuracy | clarity | methodology | missing-citation | strength"
    }
  ],
  "suggestions": [
    "A complete, actionable suggestion sentence"
  ]
}

IMPORTANT RULES:
- "quote" MUST be an EXACT substring copied from the paper text. Do NOT paraphrase. Keep quotes short (10-40 words) so they can be matched.
- Aim for 5-15 annotations covering the most important issues.
- Aim for 3-8 suggestions that summarize key improvements.
- "type" must be one of: "citation" (citation formatting/usage), "accuracy" (factual concern), "clarity" (writing/readability), "methodology" (methodology issue), "missing-citation" (needs a citation), "strength" (something done well).
- Include at least 1-2 "strength" annotations to highlight what the paper does well.
- Be constructive, specific, and scholarly.
- Only output the JSON object. No other text.`,
      messages: [
        {
          role: "user",
          content: `Here is the paper to review:\n\n${truncated}`,
        },
      ],
    });

    // Track token usage from citation analysis
    if (response.usage) {
      const db2 = await getDb();
      db2.collection("token_usage").insertOne({
        userId: auth.userId,
        apiKeyId: null,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        action: "analyze_citations",
        topic: paper.filename,
        createdAt: new Date(),
      }).catch(() => {});
    }

    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Parse JSON from Claude's response
    let parsed: {
      annotations: Array<{
        quote: string;
        comment: string;
        type: string;
      }>;
      suggestions: string[];
    };

    try {
      // Try to extract JSON if Claude wrapped it in markdown fences
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error(
        "Failed to parse Claude JSON response:",
        rawText.slice(0, 500)
      );
      return NextResponse.json(
        { error: "Failed to parse the analysis. Please try again." },
        { status: 500 }
      );
    }

    // Validate structure
    if (!Array.isArray(parsed.annotations)) parsed.annotations = [];
    if (!Array.isArray(parsed.suggestions)) parsed.suggestions = [];

    return NextResponse.json({
      annotations: parsed.annotations,
      suggestions: parsed.suggestions,
      paperFilename: paper.filename,
    });
  } catch (error) {
    console.error("Claude check-paper error:", error);
    return NextResponse.json(
      { error: "Failed to analyze the paper" },
      { status: 500 }
    );
  }
}
