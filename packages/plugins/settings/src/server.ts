/** Settings' server: `<global>/settings.json`, then `<project>/settings.json` once trusted. */

import { Effect, FileSystem, Layer, Path, Result, Schema, Semaphore } from "effect";

import { Directories } from "@liminal/sdk";

import {
  type SectionSchema,
  Settings,
  SettingsInvalid,
  type SettingsLayer,
  SettingsWriteFailed,
} from "./contract.ts";
import { editSettings, mergeSection, parseSettings } from "./server/files.ts";

/** This plugin's own section, in the global file only: the folders the user trusts. */
const OwnSection = Schema.Struct({
  trustedFolders: Schema.Array(Schema.String).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed([])),
  ),
});

const decode = <S extends SectionSchema>(name: string, schema: S, value: Schema.Json) =>
  Schema.decodeEffect(Schema.toCodecJson(schema))(value).pipe(
    Effect.mapError((error) => new SettingsInvalid({ section: name, message: error.message })),
  );

/** The settings files, and reading them; a missing file reads as empty. */
const settingsFiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directories = yield* Directories;

  const files: Record<SettingsLayer, string> = {
    global: path.join(directories.global, "settings.json"),
    project: path.join(directories.project, "settings.json"),
  };

  const text = (file: string) =>
    Effect.flatMap(fs.exists(file), (exists) =>
      exists ? fs.readFileString(file) : Effect.succeed(""),
    );

  /** One layer's file, parsed; `section` names who asked, for the error. */
  const load = (layer: SettingsLayer, section: string) =>
    text(files[layer]).pipe(
      Effect.mapError((error) => error.message),
      Effect.flatMap((content) => Effect.fromResult(parseSettings(content))),
      Effect.mapError(
        (message) => new SettingsInvalid({ section, message: `${files[layer]}: ${message}` }),
      ),
    );

  /** Sets the value at `at` in one layer's file, keeping its comments. */
  const write = Effect.fn("Settings.write")(function* (
    layer: SettingsLayer,
    at: ReadonlyArray<string>,
    value: Schema.Json | undefined,
  ) {
    const file = files[layer];
    const failed = (message: string) => new SettingsWriteFailed({ file, message });

    const current = yield* Effect.mapError(text(file), (error) => failed(error.message));
    yield* Effect.fromResult(Result.mapError(parseSettings(current), failed));

    yield* fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(
      Effect.andThen(fs.writeFileString(file, editSettings(current, at, value))),
      Effect.mapError((error) => failed(error.message)),
    );
  });

  return { load, write, workspace: directories.workspace };
});

const make = Effect.gen(function* () {
  const { load, write, workspace } = yield* settingsFiles;
  const writes = yield* Semaphore.make(1);

  const trustedFolders = Effect.flatMap(load("global", "settings"), (global) =>
    decode("settings", OwnSection, global["settings"] ?? {}),
  ).pipe(Effect.map((own) => own.trustedFolders));

  const projectTrusted = Effect.map(trustedFolders, (folders) => folders.includes(workspace));

  /** The layers that load: global always, project only in a trusted workspace. */
  const layers = (section: string) =>
    Effect.gen(function* () {
      const global = yield* load("global", section);
      if (!(yield* projectTrusted)) return [global];

      return [global, yield* load("project", section)];
    });

  const section = <S extends SectionSchema>(name: string, schema: S) =>
    Effect.flatMap(layers(name), (loaded) => decode(name, schema, mergeSection(loaded, name)));

  const trustProject = Effect.flatMap(trustedFolders, (folders) =>
    folders.includes(workspace)
      ? Effect.void
      : write("global", ["settings", "trustedFolders"], [...folders, workspace]),
  );

  return Settings.of({
    section,
    write: (layer, at, value) => writes.withPermits(1)(write(layer, at, value)),
    projectTrusted,
    trustProject: writes.withPermits(1)(trustProject),
  });
});

export const layer = Layer.effect(Settings, make);
