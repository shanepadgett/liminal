/**
 * Reads `docs/reference/sources.json`, the list of dependencies whose docs are copied into the
 * repo.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";

import { Schema } from "effect";

const GitRef = Schema.Union([
  Schema.Struct({ tag: Schema.String }),
  Schema.Struct({ branch: Schema.String }),
]);

export type GitRef = typeof GitRef.Type;

const DocSet = Schema.Struct({
  origin: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("installed") }),
    Schema.Struct({ kind: Schema.Literal("git"), repository: Schema.String, ref: GitRef }),
  ]),
  files: Schema.Array(Schema.String),
  exclude: Schema.optionalKey(Schema.Array(Schema.String)),
});

export type DocSet = typeof DocSet.Type;

/**
 * A file or folder the package installs, read in place. `path` is relative to the package folder;
 * `package` names an installed dependency of the source package when the API lives there instead.
 */
const ApiPointer = Schema.Struct({
  kind: Schema.Literals(["source", "types", "schema"]),
  package: Schema.optionalKey(Schema.String),
  path: Schema.String,
});

export type ApiPointer = typeof ApiPointer.Type;

const Source = Schema.Struct({
  package: Schema.String,
  versionSource: Schema.Literals(["lock", "mise"]),
  summary: Schema.String,
  docs: Schema.Array(DocSet),
  api: Schema.Array(ApiPointer),
});

export type Source = typeof Source.Type;

const Manifest = Schema.Struct({
  /** Direct dependencies and tools that need no reference. */
  ignore: Schema.Array(Schema.String),
  sources: Schema.Array(Source),
});

export type Manifest = typeof Manifest.Type;

export const REFERENCE = "docs/reference";
export const COPIES = `${REFERENCE}/copies`;
export const MANIFEST = `${REFERENCE}/sources.json`;

const decodeManifest = Schema.decodeUnknownSync(Manifest);

export const loadManifest = async (cwd: string): Promise<Manifest> => {
  const manifest = decodeManifest(await Bun.file(join(cwd, MANIFEST)).json());
  const seen = new Set<string>();

  for (const source of manifest.sources) {
    if (seen.has(source.package))
      throw new Error(`Duplicate documentation source: ${source.package}`);

    seen.add(source.package);
  }

  return manifest;
};

/** Changes whenever a source is edited, so copies made from an older entry read as stale. */
export const fingerprint = (source: Source): string =>
  createHash("sha256").update(JSON.stringify(source)).digest("hex").slice(0, 16);
