/** Each plugin's state after boot, and why an inactive plugin is inactive. */

import { type Cause, Data } from "effect";

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
