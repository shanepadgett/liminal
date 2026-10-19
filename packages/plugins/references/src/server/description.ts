/** A reference's one-line description: GitHub's, saved at clone time, else the README's first line. */

import { Duration, Effect, FileSystem, Option, Path, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

/** GitHub's description, kept in the clone's `.git` folder. */
const SAVED = "liminal-description";

const README_NAMES = ["README.md", "README", "readme.md", "README.markdown"];
const GITHUB_TIMEOUT = Duration.seconds(5);
const GITHUB_URL = /github\.com[/:](?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?\/?$/i;
const ORIGIN_URL = /\[remote "origin"\][^[]*?\burl\s*=\s*(\S+)/;

/** A line that starts a title, badge, tag, list, table or code block says little about the project. */
const NOT_PROSE = /^[#!<[|>`=\-*_~]/;

const Repository = Schema.Struct({ description: Schema.NullOr(Schema.String) });

/** What the descriptions are read and fetched with. */
export interface DescriptionTools {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly http: HttpClient.HttpClient;
}

/** The first line of prose in a README, with Markdown links and emphasis reduced to their text. */
export const readmeLine = (readme: string) =>
  Option.map(
    Option.fromUndefinedOr(
      readme
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line !== "" && !NOT_PROSE.test(line)),
    ),
    (line) =>
      line
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[*_`]/g, "")
        .trim(),
  );

const readmeOf = (tools: DescriptionTools, clone: string) =>
  Effect.firstSuccessOf(
    README_NAMES.map((name) => tools.fs.readFileString(tools.path.join(clone, name))),
  ).pipe(Effect.option, Effect.map(Option.flatMap(readmeLine)));

/** The saved GitHub description, else the README's, else none. */
export const readDescription = (tools: DescriptionTools, clone: string) =>
  tools.fs.readFileString(tools.path.join(clone, ".git", SAVED)).pipe(
    Effect.map((text) => text.trim()),
    Effect.option,
    Effect.map(Option.filter((text) => text !== "")),
    Effect.filterOrElse(Option.isSome, () => readmeOf(tools, clone)),
  );

/** GitHub's description of the repository `url` names; none for another host or on any failure. */
export const githubDescription = (http: HttpClient.HttpClient, url: string) => {
  const groups = GITHUB_URL.exec(url.trim())?.groups;
  if (groups === undefined) return Effect.succeedNone;

  return HttpClientRequest.get(
    `https://api.github.com/repos/${groups["owner"] ?? ""}/${groups["repo"] ?? ""}`,
  ).pipe(
    HttpClientRequest.setHeader("accept", "application/vnd.github+json"),
    http.execute,
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Repository)),
    Effect.map(({ description }) =>
      Option.filter(Option.fromNullOr(description?.trim() ?? null), (text) => text !== ""),
    ),
    Effect.timeout(GITHUB_TIMEOUT),
    Effect.orElseSucceed(() => Option.none<string>()),
  );
};

/** Saves `description` in the clone's `.git` folder; a failure to save is ignored. */
export const saveDescription = (
  tools: DescriptionTools,
  clone: string,
  description: Option.Option<string>,
) =>
  Option.match(description, {
    onNone: () => Effect.void,
    onSome: (text) =>
      tools.fs.writeFileString(tools.path.join(clone, ".git", SAVED), text).pipe(Effect.ignore),
  });

/** Fetches and saves GitHub's description for a clone that has none saved yet; never fails. */
export const fillDescription = (tools: DescriptionTools, clone: string) =>
  Effect.gen(function* () {
    if (yield* tools.fs.exists(tools.path.join(clone, ".git", SAVED))) return;
    const config = yield* tools.fs.readFileString(tools.path.join(clone, ".git", "config"));
    const url = ORIGIN_URL.exec(config)?.[1];
    if (url === undefined) return;
    yield* saveDescription(tools, clone, yield* githubDescription(tools.http, url));
  }).pipe(Effect.ignore);
