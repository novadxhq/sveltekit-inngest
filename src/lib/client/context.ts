import { getContext, setContext } from "svelte";
import type { SourceSelect } from "sveltekit-sse";
import type { Readable } from "svelte/store";
import type { HealthPayload, ReactiveCurrent, RealtimeHealthState } from "./types.js";

export type RealtimeBusChannelContextValue = {
  channelId: string;
  topics: string[];
  select: SourceSelect;
  health: Readable<HealthPayload | null>;
  healthState?: RealtimeHealthState;
};

export type RealtimeBusContextValue = {
  channels: Readable<Record<string, RealtimeBusChannelContextValue>>;
  channelsState?: ReactiveCurrent<Record<string, RealtimeBusChannelContextValue>>;
};

const REALTIME_CONTEXT_KEY = Symbol("novadx-realtime-bus-context");

export function setRealtimeContext(value: RealtimeBusContextValue): RealtimeBusContextValue {
  setContext(REALTIME_CONTEXT_KEY, value);
  return value;
}

export function getRealtimeContext(): RealtimeBusContextValue | undefined {
  return getContext<RealtimeBusContextValue | undefined>(REALTIME_CONTEXT_KEY);
}
