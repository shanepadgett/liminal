/**
 * Settings' server: `<global>/settings.json`, then `<project>/settings.json` once trusted, then the
 * launch settings, such as `--model`.
 */

import { Effect, FileSystem, Layer, Path, Result, Schema, Semaphore } from "effect";

import { Directories, editJson, LaunchSettings, parseJsonObject, ProjectTrust } from "@liminal/sdk";

import {
  type SectionSchema,
  Settings,
  SettingsInvalid,
  type SettingsLayer,
  SettingsWriteFailed,
} from "./contract.ts";
import { mergeSection } from "./server/files.ts";

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
      Effect.flatMap((content) => Effect.fromResult(parseJsonObject(content))),
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
    yield* Effect.fromResult(Result.mapError(parseJsonObject(current), failed));

    yield* fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(
      Effect.andThen(fs.writeFileString(file, editJson(current, at, value))),
      Effect.mapError((error) => failed(error.message)),
    );
  });

  return { load, write };
});

const make = Effect.gen(function* () {
  const { load, write } = yield* settingsFiles;
  const trust = yield* ProjectTrust;
  const launch = yield* LaunchSettings;
  const writes = yield* Semaphore.make(1);

  /** The layers that load: global always, project only in a trusted workspace. */
  const layers = (section: string) =>
    Effect.gen(function* () {
      const global = yield* load("global", section);

      const trusted = yield* trust.trusted.pipe(
        Effect.mapError(
          (error) => new SettingsInvalid({ section, message: `${error.file}: ${error.message}` }),
        ),
      );

      if (!trusted) return [global, launch.sections];

      return [global, yield* load("project", section), launch.sections];
    });

  const section = <S extends SectionSchema>(name: string, schema: S) =>
    Effect.flatMap(layers(name), (loaded) => decode(name, schema, mergeSection(loaded, name)));

  return Settings.of({
    section,
    write: (layer, at, value) => writes.withPermits(1)(write(layer, at, value)),
  });
});

export const layer = Layer.effect(Settings, make);
