/**
 * `webfetch`: reads one page over HTTP(S). Text types come back as text, HTML as plain text with
 * its links; other types and pages over 5 MB fail.
 */

import { Duration, Effect, Stream } from "effect";
import { type HttpClient, HttpClientRequest } from "effect/http";

import { ToolFailed } from "@liminal/sdk";

import { htmlText } from "./html.ts";

const maxBytes = 5 * 1024 * 1024;

// Some sites refuse requests that do not look like a browser's.
const browser =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

const isText = (type: string) =>
  type === ""
  || type.startsWith("text/")
  || ["json", "xml", "javascript"].some((kind) => type.endsWith(kind));

const isHtml = (type: string) => type === "text/html" || type === "application/xhtml+xml";

const joined = (read: Uint8Array, chunk: Uint8Array) => {
  const all = new Uint8Array(read.length + chunk.length);
  all.set(read);
  all.set(chunk, read.length);

  return all;
};

const read = (http: HttpClient.HttpClient, url: string) =>
  Effect.gen(function* () {
    const failed = (problem: string) =>
      new ToolFailed({ message: `Cannot fetch ${url}: ${problem}` });

    if (!/^https?:\/\//i.test(url)) return yield* failed("only http and https addresses are read");

    const response = yield* http
      .execute(
        HttpClientRequest.get(url, {
          headers: {
            "user-agent": browser,
            accept: "text/html, application/xhtml+xml, text/plain;q=0.9, */*;q=0.5",
          },
        }),
      )
      .pipe(Effect.mapError((error) => failed(error.message)));

    const contentType = response.headers["content-type"] ?? "";
    const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!isText(type)) return yield* failed(`it is ${type}, not text; download it with shell`);

    const bytes = yield* Stream.runFoldEffect(
      response.stream.pipe(Stream.mapError((error) => failed(error.message))),
      () => new Uint8Array(0),
      (sofar, chunk) =>
        sofar.length + chunk.length > maxBytes
          ? Effect.fail(failed("it is over 5 MB; download it with shell"))
          : Effect.succeed(joined(sofar, chunk)),
    );

    const body = new TextDecoder().decode(bytes);
    const text = isHtml(type) ? htmlText(body) : body;

    return `URL: ${response.request.url}\nStatus: ${response.status}\nType: ${contentType}\n\n${text}`;
  });

/** The page at `url` with a short header, or a failure after `timeout`. */
export const fetchPage = (http: HttpClient.HttpClient, url: string, timeout: Duration.Duration) =>
  read(http, url).pipe(
    Effect.timeoutOrElse({
      duration: timeout,
      orElse: () =>
        Effect.fail(
          new ToolFailed({
            message: `Cannot fetch ${url}: no answer in ${Duration.toSeconds(timeout)} seconds`,
          }),
        ),
    }),
  );
