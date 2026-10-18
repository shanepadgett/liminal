/** A hand-written Responses stream and a one-model catalog, shared by the provider tests. */

import { Effect, Layer, Option, type Schema } from "effect";

import { ModelCatalog } from "@liminal/model-catalog/contract";
import { event } from "@liminal/sdk/testing";

const response = (status: string, output: ReadonlyArray<Schema.Json>) => ({
  id: "resp_1",
  object: "response",
  created_at: 1,
  model: "gpt-test",
  status,
  output,
  usage:
    status === "completed"
      ? {
          input_tokens: 10,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 2,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 12,
        }
      : null,
});

const message = (text: string, status: string) => ({
  type: "message",
  id: "msg_1",
  role: "assistant",
  status,
  content: text === "" ? [] : [{ type: "output_text", text, annotations: [] }],
});

/** A reply saying "Hi". */
export const replyStream = [
  event("response.created", { sequence_number: 0, response: response("in_progress", []) }),
  event("response.output_item.added", {
    sequence_number: 1,
    output_index: 0,
    item: message("", "in_progress"),
  }),
  event("response.output_text.delta", {
    sequence_number: 2,
    item_id: "msg_1",
    output_index: 0,
    content_index: 0,
    delta: "Hi",
    logprobs: [],
  }),
  event("response.output_item.done", {
    sequence_number: 3,
    output_index: 0,
    item: message("Hi", "completed"),
  }),
  event("response.completed", {
    sequence_number: 4,
    response: response("completed", [message("Hi", "completed")]),
  }),
].join("");

export const fakeCatalog = Layer.succeed(
  ModelCatalog,
  ModelCatalog.of({
    models: () =>
      Effect.succeed([
        {
          info: {
            id: "gpt-test",
            name: "GPT Test",
            contextWindow: 400_000,
            maxOutput: 128_000,
            thinking: [],
            input: ["text"],
          },
          package: Option.none(),
        },
      ]),
  }),
);
