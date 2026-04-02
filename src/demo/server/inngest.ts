import { Inngest, eventType, staticSchema } from "inngest";
import { env } from "$env/dynamic/private";
import { dev } from "$app/environment";
import type { DemoEvent, UserDemoEvent } from "./demo.ts";

const isDevFlag = env.INNGEST_DEV;
const isDev =
  isDevFlag === "1" || isDevFlag === "true" || (isDevFlag == null && dev);
const baseUrl = env.INNGEST_BASE_URL ?? (isDev ? "http://localhost:8288" : undefined);
const eventKey = env.INNGEST_EVENT_KEY ?? (isDev ? "dev" : undefined);

export const demoRealtimeEvent = eventType("demo/realtime", {
  schema: staticSchema<DemoEvent>(),
});

export const demoRealtimeAdminEvent = eventType("demo/realtime-admin", {
  schema: staticSchema<DemoEvent>(),
});

export const demoNestedRealtimeEvent = eventType("demo/nested-realtime", {
  schema: staticSchema<DemoEvent>(),
});

export const demoRealtimeUserEvent = eventType("demo/realtime-user", {
  schema: staticSchema<UserDemoEvent>(),
});

export const inngest = new Inngest({
  id: "svelte-inngest-demo",
  eventKey,
  baseUrl,
  isDev,
});
