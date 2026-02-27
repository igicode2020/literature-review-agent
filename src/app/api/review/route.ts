import { runAgent } from "@/lib/agent";
import { NextRequest } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  let topic: string;
  let apiKeyId: string | null = null;

  // Check for API key auth header
  const authHeader = req.headers.get("x-api-key");
  if (authHeader) {
    const db = await getDb();
    const key = await db.collection("api_keys").findOne({ key: authHeader, revoked: { $ne: true } });
    if (key) {
      apiKeyId = key._id.toString();
    }
  }

  try {
    const body = await req.json();
    topic = body.topic;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Topic is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const abortController = new AbortController();

  // Relay the client disconnect to our abort controller
  req.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (eventType: string, data: unknown) => {
        try {
          const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller may already be closed
        }
      };

      try {
        await runAgent(
          topic.trim(),
          (event) => {
            sendEvent(event.type, event.data);

            // Save token usage to DB when we get it
            if (event.type === "token_usage" && auth) {
              const usage = event.data as Record<string, unknown>;
              getDb().then((db) => {
                db.collection("token_usage").insertOne({
                  userId: auth.userId,
                  apiKeyId: apiKeyId || null,
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens,
                  totalTokens: usage.totalTokens,
                  action: "literature_review",
                  topic: topic.trim(),
                  createdAt: new Date(),
                });
                // Update API key usage count if applicable
                if (apiKeyId) {
                  db.collection("api_keys").updateOne(
                    { _id: new ObjectId(apiKeyId) },
                    {
                      $inc: {
                        totalTokens: usage.totalTokens as number,
                        requestCount: 1,
                      },
                      $set: { lastUsedAt: new Date() },
                    }
                  );
                }
              }).catch(() => {});
            }
          },
          abortController.signal
        );
      } catch (error) {
        sendEvent(
          "error",
          error instanceof Error ? error.message : "An unexpected error occurred"
        );
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
