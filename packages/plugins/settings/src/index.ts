/** Settings over `settings.json` in the global folder, with the project folder's file over it. */
import { Effect, FileSystem, Layer, Path, Result, Schema, Semaphore } from "effect";

import { definePlugin, Registry } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";

import {
  DeclaredSettings,
  type Setting,
  Settings,
  SettingsInvalid,
  type SettingsScope,
  SettingsWriteFailed,
} from "./contract.ts";
import { editJson, parseJsonObject } from "./jsonc.ts";
import { mergeJson } from "./merge.ts";

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directories = yield* Directories;
  // Each write reads the file, edits it and saves it; two at once would lose one edit.
  const writes = yield* Semaphore.make(1);

  const files: Record<SettingsScope, string> = {
    global: path.join(directories.global, "settings.json"),
    project: path.join(directories.project, "settings.json"),
  };

  /** A missing file reads as empty. */
  const readText = (file: string) =>
    Effect.flatMap(fs.exists(file), (exists) =>
      exists ? fs.readFileString(file) : Effect.succeed(""),
    );

  const readKey = Effect.fn("Settings.readKey")(function* (scope: SettingsScope, key: string) {
    const file = files[scope];

    const invalid = (message: string) =>
      new SettingsInvalid({
        key,
        message: `Cannot read ${file}: ${message}. Fix or delete the file.`,
      });

    const text = yield* Effect.mapError(readText(file), (error) => invalid(error.message));
    const settings = yield* Effect.fromResult(Result.mapError(parseJsonObject(text), invalid));

    return settings[key];
  });

  const get = Effect.fn("Settings.get")(function* <T>(setting: Setting<T>) {
    const global = yield* readKey("global", setting.key);
    const project = yield* readKey("project", setting.key);

    return yield* Schema.decodeUnknownEffect(setting.schema)(mergeJson(global, project) ?? {}).pipe(
      Effect.mapError(
        (error) =>
          new SettingsInvalid({
            key: setting.key,
            message: `"${setting.key}" in settings.json is invalid: ${error.message}. Fix or remove the value.`,
          }),
      ),
    );
  });

  const write = Effect.fn("Settings.write")(function* (
    scope: SettingsScope,
    at: ReadonlyArray<string>,
    value: Schema.Json | undefined,
  ) {
    const file = files[scope];

    const failed = (message: string) =>
      new SettingsWriteFailed({ file, message: `Cannot write ${file}: ${message}.` });

    const text = yield* Effect.mapError(readText(file), (error) => failed(error.message));
    yield* Effect.fromResult(Result.mapError(parseJsonObject(text), failed));

    yield* fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(
      Effect.andThen(fs.writeFileString(file, editJson(text, at, value))),
      Effect.mapError((error) => failed(error.message)),
    );
  });

  return Settings.of({
    get,
    write: (scope, at, value) => writes.withPermits(1)(write(scope, at, value)),
  });
});

export default definePlugin({
  name: "settings",
  provides: [Settings, DeclaredSettings],
  requires: [Directories, FileSystem.FileSystem, Path.Path],
  layer: Layer.mergeAll(
    Layer.effect(Settings, make),
    Layer.effect(DeclaredSettings, Registry.make<Setting<unknown>>()),
  ),
});
