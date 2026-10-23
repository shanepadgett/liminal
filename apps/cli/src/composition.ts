/** The plugins the CLI runs, and a client host over them in this process. */
import { BunServices } from "@effect/platform-bun";
import { Crypto, FileSystem, Layer, Path } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { ChildProcessSpawner } from "effect/process";

import accounts from "@shanepadgett/liminal-accounts";
import chat from "@shanepadgett/liminal-chat";
import { inMemory } from "@shanepadgett/liminal-client";
import { compose, definePlugin } from "@shanepadgett/liminal-core";
import directories from "@shanepadgett/liminal-directories";
import environment from "@shanepadgett/liminal-environment";
import history from "@shanepadgett/liminal-history";
import instructions from "@shanepadgett/liminal-instructions";
import loop from "@shanepadgett/liminal-loop";
import model from "@shanepadgett/liminal-model";
import modelAnthropic from "@shanepadgett/liminal-model-anthropic";
import modelCatalog from "@shanepadgett/liminal-model-catalog";
import modelChoice from "@shanepadgett/liminal-model-choice";
import modelFavorites from "@shanepadgett/liminal-model-favorites";
import modelOpenai from "@shanepadgett/liminal-model-openai";
import modelOpencodeGo from "@shanepadgett/liminal-model-opencode-go";
import modelOpenrouter from "@shanepadgett/liminal-model-openrouter";
import palette from "@shanepadgett/liminal-palette";
import persona from "@shanepadgett/liminal-persona";
import session from "@shanepadgett/liminal-session";
import sessionPicker from "@shanepadgett/liminal-session-picker";
import settings from "@shanepadgett/liminal-settings";
import slash from "@shanepadgett/liminal-slash";
import sqlite from "@shanepadgett/liminal-sqlite";
import stash from "@shanepadgett/liminal-stash";
import systemPrompt from "@shanepadgett/liminal-system-prompt";
import tags from "@shanepadgett/liminal-tags";
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

/** Every plugin, in composition order; the TUI loads their `tui` entries. */
export const plugins = [
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
  instructions,
  environment,
  toolDefinitions,
  loop,
  modelChoice,
  modelFavorites,
  tags,
  theme,
  chat,
  stash,
  slash,
  palette,
  sessionPicker,
] as const;

/** The client host, with the composition built behind it. */
export const host = Layer.provide(inMemory, compose(plugins));
