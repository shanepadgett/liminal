/** The plugins the CLI runs, and a client host over them in this process. */
import { BunServices } from "@effect/platform-bun";
import { FileSystem, Layer, Path } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";

import { inMemory } from "@shanepadgett/liminal-client";
import { compose, definePlugin } from "@shanepadgett/liminal-core";
import directories from "@shanepadgett/liminal-directories";
import history from "@shanepadgett/liminal-history";
import loop from "@shanepadgett/liminal-loop";
import model from "@shanepadgett/liminal-model";
import modelAnthropic from "@shanepadgett/liminal-model-anthropic";
import modelCatalog from "@shanepadgett/liminal-model-catalog";
import persona from "@shanepadgett/liminal-persona";
import session from "@shanepadgett/liminal-session";
import settings from "@shanepadgett/liminal-settings";
import sqlite from "@shanepadgett/liminal-sqlite";
import systemPrompt from "@shanepadgett/liminal-system-prompt";
import toolDefinitions from "@shanepadgett/liminal-tool-definitions";
import tools from "@shanepadgett/liminal-tools";

/** Bun's files, paths and HTTP for the plugins that ask for them. */
const runtime = definePlugin({
  name: "runtime",
  provides: [Path.Path, FileSystem.FileSystem, HttpClient.HttpClient],
  requires: [],
  layer: Layer.mergeAll(BunServices.layer, FetchHttpClient.layer),
});

const composition = compose([
  runtime,
  directories,
  settings,
  sqlite,
  session,
  model,
  modelCatalog,
  modelAnthropic,
  tools,
  history,
  systemPrompt,
  persona,
  toolDefinitions,
  loop,
]);

/** The client host, with the composition built behind it. */
export const host = Layer.provide(inMemory, composition);
