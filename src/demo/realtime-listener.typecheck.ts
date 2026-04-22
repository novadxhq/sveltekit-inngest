import { demoChannel } from "./channels.js";
import { getRealtimeBusState } from "$lib/index.js";

export function verifyRealtimeListenerTypes() {
  const { onMessage } = getRealtimeBusState(demoChannel);

  onMessage("message", ({ data, topic }) => {
    const message: string = data.message;
    const topicName: "message" = topic;
    void message;
    void topicName;
  });

  // @ts-expect-error invalid topic names should be rejected
  onMessage("missing-topic", () => {});

  onMessage("message", (payload) => {
    const topicName: "message" = payload.topic;
    void topicName;

    // @ts-expect-error unknown payload fields should be rejected
    void payload.data.missing;
  });
}
