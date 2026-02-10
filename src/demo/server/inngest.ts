import { EventSchemas, Inngest } from "inngest";
import { realtimeMiddleware } from "@inngest/realtime/middleware";
import { env } from "$env/dynamic/private";
import { dev } from "$app/environment";
import type { DemoEvent } from "./demo.ts";

const isDevFlag = env.INNGEST_DEV;
const isDev =
  isDevFlag === "1" || isDevFlag === "true" || (isDevFlag == null && dev);
const baseUrl = env.INNGEST_BASE_URL ?? (isDev ? "http://localhost:8288" : undefined);
const eventKey = env.INNGEST_EVENT_KEY ?? (isDev ? "dev" : undefined);

type Events = {
  "demo/realtime": {
    data: DemoEvent;
  };
  "demo/realtime-admin": {
    data: DemoEvent;
  };
  "demo/nested-realtime": {
    data: DemoEvent;
  };
};

const schemas = new EventSchemas().fromRecord<Events>();

export const inngest = new Inngest({
  id: "svelte-inngest-demo",
  eventKey,
  baseUrl,
  isDev,
  schemas: schemas,
  middleware: [realtimeMiddleware()],
});
