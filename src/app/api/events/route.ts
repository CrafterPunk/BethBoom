import { NextRequest } from "next/server";

import { subscribeToAppEvents, type AppEvent } from "@/lib/events";

export const runtime = "nodejs";

const encoder = new TextEncoder();

function serializeEvent(event: AppEvent) {
  const data = JSON.stringify(event);
  return encoder.encode(`data: ${data}\n\n`);
}

export async function GET(request: NextRequest) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: AppEvent) => {
        controller.enqueue(serializeEvent(event));
      };

      const unsubscribe = subscribeToAppEvents(send);

      const interval = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\n\n`));
      }, 25_000);

      const close = () => {
        clearInterval(interval);
        unsubscribe();
        controller.close();
      };

      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Transfer-Encoding": "chunked",
    },
  });
}
