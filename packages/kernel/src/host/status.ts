/** Each plugin's state after boot, and why an inactive plugin is inactive. */

import { Cause, Data } from "effect";

export type InactiveReason = Data.TaggedEnum<{
  /** The manifest sets `enabledByDefault: false`. */
  Disabled: {};
  /** No enabled plugin provides a required service, or several do. */
  MissingService: { readonly service: string };
  /** This plugin and others provide the same service; none is chosen silently. */
  DuplicateProvider: { readonly service: string; readonly plugins: ReadonlyArray<string> };
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
  Disabled: () => "disabled by default",
  MissingService: ({ service }) => `no enabled plugin provides ${service}`,
  DuplicateProvider: ({ service, plugins }) => `${service} is provided by ${plugins.join(", ")}`,
  Cycle: ({ plugins }) => `its requirements cycle through ${plugins.join(", ")}`,
  DependencyInactive: ({ plugin }) => `${plugin} is inactive`,
  ImportFailed: ({ cause }) => `failed to load: ${Cause.pretty(cause)}`,
  BuildFailed: ({ cause }) => `failed to build: ${Cause.pretty(cause)}`,
});
