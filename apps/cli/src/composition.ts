/** The plugins the CLI runs, and a client host over them in this process. */
import { BunServices } from "@effect/platform-bun";
import { Crypto, FileSystem, Layer, Path } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { ChildProcessSpawner } from "effect/process";

import accounts from "@shanepadgett/liminal-accounts";
import { inMemory } from "@shanepadgett/liminal-client";
import { compose, definePlugin } from "@shanepadgett/liminal-core";
import directories from "@shanepadgett/liminal-directories";
import history from "@shanepadgett/liminal-history";
import loop from "@shanepadgett/liminal-loop";
import model from "@shanepadgett/liminal-model";
import modelAnthropic from "@shanepadgett/liminal-model-anthropic";
import modelCatalog from "@shanepadgett/liminal-model-catalog";
import modelOpenai from "@shanepadgett/liminal-model-openai";
import modelOpencodeGo from "@shanepadgett/liminal-model-opencode-go";
import modelOpenrouter from "@shanepadgett/liminal-model-openrouter";
import persona from "@shanepadgett/liminal-persona";
import session from "@shanepadgett/liminal-session";
import settings from "@shanepadgett/liminal-settings";
import sqlite from "@shanepadgett/liminal-sqlite";
import systemPrompt from "@shanepadgett/liminal-system-prompt";
import theme from "@shanepadgett/liminal-theme";
import toolDefinitions from "@shanepadgett/liminal-tool-definitions";
import tools from "@shanepadgett/liminal-tools";

/** Bun's files, paths, crypto, HTTP and child processes for the plugins that ask for them. */
const runtime = definePlugin({
  name: "runtime",
  provides: [
    Path.Path,
    FileSystem.FileSystem,
    Crypto.Crypto,
    HttpClient.HttpClient,
    ChildProcessSpawner.ChildProcessSpawner,
  ],
  requires: [],
  layer: Layer.mergeAll(BunServices.layer, FetchHttpClient.layer),
});

const composition = compose([
  runtime,
  directories,
  settings,
  sqlite,
  accounts,
  session,
  model,
  modelCatalog,
  modelAnthropic,
  modelOpenai,
  modelOpenrouter,
  modelOpencodeGo,
  tools,
  history,
  systemPrompt,
  persona,
  toolDefinitions,
  loop,
  theme,
]);

/** The client host, with the composition built behind it. */
export const host = Layer.provide(inMemory, composition);
