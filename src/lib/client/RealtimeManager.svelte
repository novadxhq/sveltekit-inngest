<script lang="ts" generics="TChannel extends ChannelInput">
	import {onDestroy} from "svelte";
	import {fromStore, writable} from "svelte/store";
	import {source, type Event as SseEvent} from "sveltekit-sse";
	import {setRealtimeContext} from "./context.js";
	import type {
		ChannelInput,
		HealthPayload,
		RealtimeManagerProps,
		ResolvedChannel,
		TopicKey,
	} from "./types.js";

	let {
		endpoint,
		channel,
		channelArgs = [],
		topics,
		params,
		children,
	}: RealtimeManagerProps<TChannel> = $props();

	const resolveChannel = <TInput extends ChannelInput>(
		input: TInput,
		args: unknown[],
	): ResolvedChannel<TInput> => {
		if (typeof input === "function") {
			const channelFactory = input as unknown as (
				...callArgs: unknown[]
			) => ResolvedChannel<TInput>;
			return channelFactory(...args);
		}

		return input as ResolvedChannel<TInput>;
	};

	const getEndpoint = () => endpoint ?? "/api/events";
	const getResolvedChannel = () => resolveChannel(channel, channelArgs ?? []);
	const getResolvedTopics = () =>
		topics?.length
			? topics
			: (Object.keys(getResolvedChannel().topics) as TopicKey<TChannel>[]);
	const getRequestBody = () =>
		JSON.stringify({
			channel: getResolvedChannel().name,
			topics: getResolvedTopics(),
			params,
		});

	const resolvedChannel = getResolvedChannel();
	const resolvedTopics = getResolvedTopics();

	const health = writable<HealthPayload | null>({
		ok: true,
		status: "connecting",
		ts: Date.now(),
	});
	const healthState = fromStore(health);

	const getDetail = (event: SseEvent): string | undefined => {
		if (event.error instanceof Error) return event.error.message;
		if (event.status >= 400) return `${event.status} ${event.statusText}`;
		return undefined;
	};

	const events = source(getEndpoint(), {
		cache: false,
		options: {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: getRequestBody(),
		},
		open: () => {
			health.set({
				ok: true,
				status: "connected",
				ts: Date.now(),
			});
		},
		close: (event: SseEvent) => {
			const detail = getDetail(event);
			if (!detail && event.status < 400) return;
			health.set({
				ok: false,
				status: "degraded",
				ts: Date.now(),
				...(detail ? {detail} : {}),
			});
		},
		error: (event: SseEvent) => {
			health.set({
				ok: false,
				status: "degraded",
				ts: Date.now(),
				detail: getDetail(event) ?? "Realtime connection error",
			});
		},
	});

	const streamHealth = events
		.select("health")
		.json<HealthPayload>(
			({previous}: {previous: HealthPayload | null}) => previous ?? null,
		);
	const streamHealthUnsubscribe = streamHealth.subscribe(
		(value: HealthPayload | null) => {
			if (value) health.set(value);
		},
	);

	setRealtimeContext({
		channelId: resolvedChannel.name,
		topics: resolvedTopics as string[],
		select: events.select,
		health,
		healthState,
	});

	onDestroy(() => {
		streamHealthUnsubscribe();
		events.close();
	});
</script>

{@render children?.()}
