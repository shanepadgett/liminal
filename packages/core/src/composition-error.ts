/** Why a set of plugins does not compose. */
import { Match, Predicate, Schema } from "effect";

export const MissingProvider = Schema.TaggedStruct("MissingProvider", {
  plugin: Schema.String,
  service: Schema.String,
});

export const DuplicateProvider = Schema.TaggedStruct("DuplicateProvider", {
  service: Schema.String,
  plugins: Schema.Array(Schema.String),
});

/** The plugins on the path, starting and ending with the same plugin. */
export const Cycle = Schema.TaggedStruct("Cycle", { plugins: Schema.Array(Schema.String) });

/** A failure or a defect while the plugin's layer builds. */
export const BuildFailed = Schema.TaggedStruct("BuildFailed", {
  plugin: Schema.String,
  cause: Schema.Defect(),
});

const CompositionProblem = Schema.Union([MissingProvider, DuplicateProvider, Cycle, BuildFailed]);

const describeCause = (cause: unknown) =>
  Predicate.isError(cause) ? cause.message : String(cause);

const describe = Match.type<typeof CompositionProblem.Type>().pipe(
  Match.tagsExhaustive({
    MissingProvider: ({ plugin, service }) =>
      `${plugin} requires ${service}; add a plugin that provides it.`,
    DuplicateProvider: ({ service, plugins }) =>
      `More than one plugin provides ${service}; keep one of ${plugins.join(", ")}.`,
    Cycle: ({ plugins }) =>
      `Plugins require each other in a cycle: ${plugins.join(" → ")}. Remove one requirement.`,
    BuildFailed: ({ plugin, cause }) =>
      `${plugin} failed to build: ${describeCause(cause)}. Fix the plugin or remove it.`,
  }),
);

export class CompositionError extends Schema.TaggedError<
  CompositionError,
  { readonly brand: unique symbol }
>()("CompositionError", { reason: CompositionProblem }) {
  override get message() {
    return describe(this.reason);
  }
}
