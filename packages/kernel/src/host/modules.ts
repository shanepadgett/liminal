/**
 * Serves the host's own copy of shared packages, such as `effect` and `@liminal/sdk`, to every
 * plugin module graph, so plugins and the host share one runtime and one set of classes.
 */

import { Effect, FileSystem, Option, Path, Predicate, Schema } from "effect";

/** The packages every plugin graph takes from the host, resolved from `from`. */
export interface SharedModules {
  /** The folder the host resolves the packages from, such as the app's own. */
  readonly from: string;
  readonly packages: ReadonlyArray<string>;
}

/** Where a specifier exported by a package resolves in the host. */
interface Served {
  readonly specifier: string;
  readonly path: string;
}

/** One condition map or target of a package's `exports`; parsed loosely, read by `targetOf`. */
interface ExportTargets {
  readonly [condition: string]: ExportTarget;
}

type ExportTarget = string | null | ExportTargets | ReadonlyArray<ExportTarget>;

const ExportTarget: Schema.Codec<ExportTarget> = Schema.Union([
  Schema.String,
  Schema.Null,
  Schema.Record(
    Schema.String,
    Schema.suspend(() => ExportTarget),
  ),
  Schema.Array(Schema.suspend(() => ExportTarget)),
]);

const PackageJson = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.optionalKey(Schema.String),
    exports: Schema.optionalKey(Schema.Record(Schema.String, ExportTarget)),
  }),
);

/** The conditions Bun picks for a runtime import, in its order. */
const conditions = ["bun", "import", "default"];

/** The file an export maps to under Bun's runtime conditions; none when blocked. */
const isTargetList = (target: ExportTarget): target is ReadonlyArray<ExportTarget> =>
  Array.isArray(target);

const targetOf = (target: ExportTarget): string | undefined => {
  if (Predicate.isString(target) || target === null) return target ?? undefined;
  if (isTargetList(target)) return target.map(targetOf).find(Predicate.isString);

  const condition = conditions.find((name) => name in target);

  return condition === undefined ? undefined : targetOf(target[condition] ?? null);
};

const resolveIn = (specifier: string, from: string) =>
  Effect.try(() => Bun.resolveSync(specifier, from)).pipe(Effect.option);

/** The package's folder: the nearest parent of its entry whose `package.json` names it. */
const packageRoot = Effect.fn("packageRoot")(function* (name: string, from: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entry = yield* resolveIn(name, from);
  if (Option.isNone(entry)) return Option.none();
  let dir = path.dirname(entry.value);

  while (dir !== path.dirname(dir)) {
    const file = path.join(dir, "package.json");
    const text = yield* fs.readFileString(file).pipe(Effect.option);
    const parsed = Option.flatMap(text, Schema.decodeUnknownOption(PackageJson));
    if (Option.isSome(parsed) && parsed.value.name === name) return Option.some(dir);
    dir = path.dirname(dir);
  }

  return Option.none();
});

/** Every file a wildcard export such as `./*` → `./dist/*.js` matches, as served specifiers. */
const expandWildcard = Effect.fn("expandWildcard")(function* (
  name: string,
  root: string,
  key: string,
  target: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const [prefix = "", suffix = ""] = path.normalize(target).split("*");
  const dir = path.join(root, path.dirname(`${prefix}x`));

  const files = yield* fs
    .readDirectory(dir, { recursive: true })
    .pipe(Effect.orElseSucceed(() => []));

  const relativePrefix = path.relative(dir, path.join(root, prefix));

  return files.flatMap((file): ReadonlyArray<Served> => {
    if (!file.startsWith(relativePrefix) || !file.endsWith(suffix)) return [];
    const middle = file.slice(relativePrefix.length, file.length - suffix.length);
    const specifier = `${name}${key.slice(1).replace("*", middle)}`;

    return [{ specifier, path: path.join(dir, file) }];
  });
});

/** Every specifier `name` exports, each with the file it resolves to in the host. */
const exportsOf = Effect.fn("exportsOf")(function* (name: string, from: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* packageRoot(name, from);

  if (Option.isNone(root))
    return yield* Effect.die(`Cannot find shared package ${name} from ${from}.`);

  const json = yield* fs.readFileString(path.join(root.value, "package.json")).pipe(Effect.orDie);
  const { exports = {} } = yield* Schema.decodeEffect(PackageJson)(json).pipe(Effect.orDie);
  const served: Array<Served> = [];

  for (const [key, value] of Object.entries(exports)) {
    const target = targetOf(value);
    if (target === undefined) continue;

    if (key.includes("*")) {
      served.push(...(yield* expandWildcard(name, root.value, key, target)));
      continue;
    }

    const specifier = `${name}${key.slice(1)}`;
    const resolved = yield* resolveIn(specifier, from);
    if (Option.isSome(resolved)) served.push({ specifier, path: resolved.value });
  }

  return served;
});

/**
 * Specifiers already served. Bun plugins are process-wide and cannot be removed, so every kernel in
 * the process shares one record of what it has served.
 */
const served = new Set<string>();

/**
 * Loads `path` in the host: a plugin callback's `import()` loads into the host, not the graph. An
 * `import()`, unlike `require`, also loads modules the host's own loaders make async.
 */
const hostExports = (path: string): Promise<Bun.OnLoadResultObject["exports"]> => import(path);

/**
 * Serves each shared package's exports to every module graph, loading each from the host only when
 * a graph first imports it. Fails the boot when a package cannot be found.
 */
export const serveShared = Effect.fn("serveShared")(function* (shared: SharedModules) {
  const found = yield* Effect.forEach(shared.packages, (name) => exportsOf(name, shared.from));
  const fresh = found.flat().filter((one) => !served.has(one.specifier));

  yield* Effect.sync(() => {
    for (const one of fresh) served.add(one.specifier);

    Bun.plugin({
      name: "liminal-shared-modules",
      setup: (builder) => {
        for (const one of fresh) {
          builder.module(one.specifier, async () => ({
            exports: await hostExports(one.path),
            loader: "object",
          }));
        }
      },
    });
  });
});
