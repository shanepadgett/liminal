/**
 * `webfetch`: one page over HTTP(S). Text types come back as text, HTML as light Markdown; other
 * types and pages over 5 MB fail with a pointer to `shell`.
 */
import { Duration, Effect, Schema, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

import { SessionLog } from "@shanepadgett/liminal-session/contract";
import { defineTool, ToolFailed, type ToolContext } from "@shanepadgett/liminal-tools/contract";

import { Fetched, webfetchName } from "./contract.ts";
import { markdownOf } from "./markdown.ts";
import { untrusted } from "./notice.ts";

const description = `Read one web page by its address. HTML comes back as Markdown with its links; plain text, JSON and XML as they are.

Only http and https addresses are read, and only text up to 5 MB. Download anything else with shell.`;

const Input = Schema.Struct({
  url: Schema.String.annotate({ description: "The http or https address to read." }),
});

type Input = typeof Input.Type;

const maxBytes = 5 * 1024 * 1024;
const limit = Duration.seconds(30);

// Some sites refuse requests that do not look like a browser's.
const browser =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

const isText = (type: string) =>
  type === ""
  || type.startsWith("text/")
  || ["json", "xml", "javascript"].some((kind) => type.endsWith(kind));

const isHtml = (type: string) => type === "text/html" || type === "application/xhtml+xml";

/** A page as read: its final address after redirects, status, type and text. */
interface Page {
  readonly url: string;
  readonly status: number;
  readonly type: string;
  readonly text: string;
}

/** The body so far. */
interface Read {
  readonly size: number;
  readonly chunks: ReadonlyArray<Uint8Array>;
}

const textOf = ({ size, chunks }: Read) => {
  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder().decode(bytes);
};

/** Why `url` is not read, or nothing when it may be. */
const refusal = (url: string): string | undefined => {
  const parsed = URL.parse(url);
  if (parsed === null) return "it is not an address";

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "only http and https addresses are read";
  }

  const hasLogin = parsed.username !== "" || parsed.password !== "";

  return hasLogin ? "it holds a user name or password" : undefined;
};

const read = Effect.fn("webfetch.read")(function* (http: HttpClient.HttpClient, url: string) {
  const failed = (problem: string) =>
    new ToolFailed({ message: `Cannot fetch ${url}: ${problem}` });

  const refused = refusal(url);
  if (refused !== undefined) return yield* failed(refused);

  const request = HttpClientRequest.get(url, {
    headers: {
      "user-agent": browser,
      accept: "text/html, application/xhtml+xml, text/plain;q=0.9, */*;q=0.5",
    },
  });

  const response = yield* http
    .execute(request)
    .pipe(Effect.mapError(({ message }) => failed(message)));

  const contentType = response.headers["content-type"] ?? "";
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!isText(type)) return yield* failed(`it is ${type}, not text; download it with shell`);

  const body = yield* Stream.runFoldEffect(
    response.stream.pipe(Stream.mapError(({ message }) => failed(message))),
    (): Read => ({ size: 0, chunks: [] }),
    (sofar, chunk) =>
      sofar.size + chunk.length > maxBytes
        ? Effect.fail(failed("it is over 5 MB; download it with shell"))
        : Effect.succeed({ size: sofar.size + chunk.length, chunks: [...sofar.chunks, chunk] }),
  );

  const text = textOf(body);

  const page: Page = {
    url: response.url,
    status: response.status,
    type,
    text: isHtml(type) ? markdownOf(text, response.url) : text,
  };

  return page;
});

export const makeFetch = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const log = yield* SessionLog;

  const fetchPage = (url: string) =>
    read(http, url).pipe(
      Effect.timeoutOrElse({
        duration: limit,
        orElse: () =>
          Effect.fail(
            new ToolFailed({
              message: `Cannot fetch ${url}: no answer in ${Duration.toSeconds(limit)} seconds`,
            }),
          ),
      }),
    );

  const run = (input: Input, { session, callId }: ToolContext) =>
    Effect.gen(function* () {
      const { url, status, type, text } = yield* fetchPage(input.url);
      yield* log.append(session, [yield* Fetched.make({ callId, url, status, type })]);

      const header = [untrusted, "", `URL: ${url}`, `Status: ${status}`, `Type: ${type}`];

      return { content: [{ type: "text" as const, text: [...header, "", text].join("\n") }] };
    }).pipe(Effect.mapError(({ message }) => new ToolFailed({ message })));

  return defineTool({ name: webfetchName, description, input: Input, run });
});
