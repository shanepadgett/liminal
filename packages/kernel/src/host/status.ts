/** Each plugin's state after boot, and why an inactive plugin is inactive. */

import { Cause, Data } from "effect";

export type InactiveReason = Data.TaggedEnum<{
  /** Off: by the manifest's `enabledByDefault`, or by the user's choice in `plugins.json`. */
  Disabled: { readonly by: "default" | "choice" };
  /** No enabled plugin provides a required service, or several chosen ones do. */
  MissingService: { readonly service: string };
  /** Several plugins chosen in `plugins.json` provide the same service; none is picked silently. */
  DuplicateProvider: { readonly service: string; readonly plugins: ReadonlyArray<string> };
  /** Another plugin chosen in `plugins.json` provides the same service. */
  Replaced: { readonly service: string; readonly by: string };
  /** Another plugin, from an earlier folder, provides the same service and none is chosen. */
  Competing: { readonly service: string; readonly active: string };
  /** The plugin's requirements lead back to itself. */
  Cycle: { readonly plugins: ReadonlyArray<string> };
  /** The provider of a required service is inactive. */
  DependencyInactive: { readonly plugin: string };
  /** The manifest or server module failed to load or has the wrong shape. */
  ImportFailed: { readonly cause: Cause.Cause<unknown> };
  /** The server's Layer failed while building. */
  BuildFailed: { readonly cause: Cause.Cause<unknown> };
}>;

export const InactiveReason = Data.taggedEnum<InactiveReason>();

export type PluginStatus = Data.TaggedEnum<{
  Active: { readonly name: string };
  Inactive: { readonly name: string; readonly reason: InactiveReason };
}>;

export const PluginStatus = Data.taggedEnum<PluginStatus>();

/** A reason as one line of text, for clients that show why a plugin is off. */
export const describeReason: (reason: InactiveReason) => string = InactiveReason.$match({
  Disabled: ({ by }) => (by === "default" ? "disabled by default" : "turned off in plugins.json"),
  MissingService: ({ service }) => `no enabled plugin provides ${service}`,
  DuplicateProvider: ({ service, plugins }) =>
    `${service} is provided by ${plugins.join(", ")}, all chosen in plugins.json`,
  Replaced: ({ service, by }) => `${by} provides ${service} instead`,
  Competing: ({ service, active }) =>
    `${active} already provides ${service}; choose one in plugins.json`,
  Cycle: ({ plugins }) => `its requirements cycle through ${plugins.join(", ")}`,
  DependencyInactive: ({ plugin }) => `${plugin} is inactive`,
  ImportFailed: ({ cause }) => `failed to load: ${Cause.pretty(cause)}`,
  BuildFailed: ({ cause }) => `failed to build: ${Cause.pretty(cause)}`,
});
