import { getContext, setContext } from "svelte";
import type { SourceSelect } from "sveltekit-sse";
import type { Readable } from "svelte/store";
import type { HealthPayload, RealtimeHealthState } from "./types.js";

export type RealtimeContextValue = {
	channelId: string;
	topics: string[];
	select: SourceSelect;
	health: Readable<HealthPayload | null>;
	healthState?: RealtimeHealthState;
};

const REALTIME_CONTEXT_KEY = Symbol("novadx-realtime-context");

export function setRealtimeContext(value: RealtimeContextValue): RealtimeContextValue {
	setContext(REALTIME_CONTEXT_KEY, value);
	return value;
}

export function getRealtimeContext(): RealtimeContextValue | undefined {
	return getContext<RealtimeContextValue | undefined>(REALTIME_CONTEXT_KEY);
}
