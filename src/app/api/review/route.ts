import { runAgent } from "@/lib/agent";
import { NextRequest } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let topic: string;

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
