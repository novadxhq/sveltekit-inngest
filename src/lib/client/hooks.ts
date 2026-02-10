import { derived, fromStore, type Readable } from "svelte/store";
import { getRealtimeContext } from "./context.js";
import type {
	ChannelInput,
	RealtimeHealthState,
	RealtimeTopicEnvelope,
	RealtimeTopicMessage,
	RealtimeTopicState,
	TopicKey,
} from "./types.js";

type JsonPredicatePayload<T> = {
	error: Error;
	raw: string;
	previous: T | null;
};

type TopicJsonOptions<
	TChannel extends ChannelInput,
	TTopic extends TopicKey<TChannel>,
	TOutput,
> = {
	map?: (message: RealtimeTopicMessage<TChannel, TTopic>) => TOutput;
	or?: (
		payload: JsonPredicatePayload<RealtimeTopicMessage<TChannel, TTopic>>
	) => RealtimeTopicMessage<TChannel, TTopic> | null;
};

export function getRealtime() {
	const context = getRealtimeContext();
	if (!context) {
		throw new Error(
			"getRealtime() requires <RealtimeManager> in the component tree."
		);
	}

	return context;
}

export function getRealtimeState(): Omit<ReturnType<typeof getRealtime>, "health"> & {
	health: RealtimeHealthState;
} {
	const context = getRealtime();

	return {
		channelId: context.channelId,
		topics: context.topics,
		select: context.select,
		health: context.healthState ?? fromStore(context.health),
	};
}

export function getRealtimeTopicJson<
	TChannel extends ChannelInput,
	TTopic extends TopicKey<TChannel>,
	TOutput = RealtimeTopicEnvelope<TChannel, TTopic>,
>(
	topic: TTopic,
	options: TopicJsonOptions<TChannel, TTopic, TOutput> = {}
): Readable<TOutput | null> {
	const { select } = getRealtime();

	const parsedMessages = select("message").json<RealtimeTopicMessage<TChannel, TTopic>>(
		options.or ??
			(({ previous }: { previous: RealtimeTopicMessage<TChannel, TTopic> | null }) =>
				previous ?? null)
	);

	const mapMessage =
		options.map ??
		((message: RealtimeTopicMessage<TChannel, TTopic>) =>
			message as TOutput);

	let previous: TOutput | null = null;

	return derived(parsedMessages, ($message) => {
		if (!$message || $message.topic !== topic) {
			return previous;
		}

		previous = mapMessage($message);
		return previous;
	});
}

export function getRealtimeTopicState<
	TChannel extends ChannelInput,
	TTopic extends TopicKey<TChannel>,
	TOutput = RealtimeTopicEnvelope<TChannel, TTopic>,
>(
	topic: TTopic,
	options: TopicJsonOptions<TChannel, TTopic, TOutput> = {}
): RealtimeTopicState<TOutput> {
	return fromStore(getRealtimeTopicJson<TChannel, TTopic, TOutput>(topic, options));
}
