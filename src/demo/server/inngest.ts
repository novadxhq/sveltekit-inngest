import { EventSchemas, Inngest } from "inngest";
import { realtimeMiddleware } from "@inngest/realtime/middleware";
import { env } from "$env/dynamic/private";
import type { DemoEvent } from "./demo.ts";

const isDev = env.INNGEST_DEV === "1" || env.INNGEST_DEV === "true";
const baseUrl = env.INNGEST_BASE_URL ?? (isDev ? "http://localhost:8288" : undefined);
const eventKey = env.INNGEST_EVENT_KEY ?? (isDev ? "dev" : undefined);

type Events = {
  'demo/realtime': {
    data: DemoEvent
  }
}

const schemas = new EventSchemas().fromRecord<Events>();

export const inngest = new Inngest({
  id: "svelte-inngest-demo",
  eventKey: eventKey ?? "local",
  baseUrl,
  isDev,
  schemas: schemas,
  middleware: [realtimeMiddleware()],
});
