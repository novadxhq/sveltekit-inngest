import { demoChannel } from "./channels.js";
import { getRealtimeBusState } from "$lib/index.js";

export function verifyRealtimeListenerTypes() {
  const { onMessage } = getRealtimeBusState(demoChannel);

  onMessage("message", (payload) => {
    const message: string = payload.message;
    void message;
  });

  // @ts-expect-error invalid topic names should be rejected
  onMessage("missing-topic", () => {});

  onMessage("message", (payload) => {
    // @ts-expect-error unknown payload fields should be rejected
    void payload.missing;
  });
}
