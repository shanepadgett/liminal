/**
 * OpenCode Go's Messages replies leave out fields Anthropic always sends, as null when they do not
 * apply, and Effect's Anthropic client requires them; they are filled before the client reads.
 */
import { Effect, Match, Option, Predicate, Schema, Stream } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";

type Fields = Readonly<Record<string, Schema.Json>>;

const decodeFields = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
);

const isFields = (value: Schema.Json | undefined): value is Fields =>
  Predicate.isObject(value) && !Array.isArray(value);

/** The object under `key`, or an empty one. */
const fieldsAt = (fields: Fields, key: string): Fields => {
  const value = fields[key];

  return isFields(value) ? value : {};
};

const messageDefaults = { stop_reason: null, stop_sequence: null };

const messageUsageDefaults = {
  cache_creation: null,
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
  service_tier: null,
};

const deltaUsageDefaults = {
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
  input_tokens: null,
};

const withMessage = (message: Fields): Fields => ({
  ...messageDefaults,
  ...message,
  usage: { ...messageUsageDefaults, ...fieldsAt(message, "usage") },
});

/** One stream event with its missing fields filled; an event that has them all is unchanged. */
const withDefaults = (event: Fields): Fields =>
  Match.value(event["type"]).pipe(
    Match.when("message_start", () => {
      const message = event["message"];

      return isFields(message) ? { ...event, message: withMessage(message) } : event;
    }),
    // Anthropic starts a thinking block with an empty signature and sends the signature last.
    Match.when("content_block_start", () => {
      const block = fieldsAt(event, "content_block");

      return block["type"] === "thinking"
        ? { ...event, content_block: { signature: "", ...block } }
        : event;
    }),
    Match.when("message_delta", () => ({
      ...event,
      delta: { ...messageDefaults, ...fieldsAt(event, "delta") },
      usage: { ...deltaUsageDefaults, ...fieldsAt(event, "usage") },
    })),
    Match.orElse(() => event),
  );

const dataPrefix = "data: ";

const withLine = (line: string) => {
  if (!line.startsWith(dataPrefix)) return line;

  return Option.match(decodeFields(line.slice(dataPrefix.length)), {
    onNone: () => line,
    onSome: (event) => `${dataPrefix}${JSON.stringify(withDefaults(event))}`,
  });
};

const withStreamDefaults = (response: HttpClientResponse.HttpClientResponse) => {
  const isStream = response.headers["content-type"]?.startsWith("text/event-stream") === true;
  if (!isStream) return response;

  const body = response.stream.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.map((line) => `${withLine(line)}\n`),
    Stream.encodeText,
  );

  // The filled body has another length.
  const headers = Object.entries(response.headers).filter(([name]) => name !== "content-length");

  return HttpClientResponse.fromWeb(
    response.request,
    new Response(Stream.toReadableStream(body), {
      status: response.status,
      headers: Object.fromEntries(headers),
    }),
  );
};

/** `client` with each streamed Messages event's missing fields filled. */
export const withMessagesDefaults = (client: HttpClient.HttpClient) =>
  HttpClient.transformResponse(client, Effect.map(withStreamDefaults));
