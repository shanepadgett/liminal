/** Settings the app was launched with, such as `--model`: they hold for this run only. */

import { Context, Layer } from "effect";

import type { JsonObject } from "./jsonc.ts";

export class LaunchSettings extends Context.Service<
  LaunchSettings,
  {
    /** Settings sections by name, over every settings file. */
    readonly sections: JsonObject;
  }
>()("liminal/sdk/LaunchSettings") {
  /** No launch settings. */
  static readonly none = Layer.succeed(LaunchSettings, LaunchSettings.of({ sections: {} }));
}
