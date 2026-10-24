/** The plugins the CLI runs, and a client host over them in this process. */
import { BunServices } from "@effect/platform-bun";
import { Crypto, FileSystem, Layer, Path } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { ChildProcessSpawner } from "effect/process";

import accounts from "@shanepadgett/liminal-accounts";
import approvals from "@shanepadgett/liminal-approvals";
import chat from "@shanepadgett/liminal-chat";
import { inMemory } from "@shanepadgett/liminal-client";
import commit from "@shanepadgett/liminal-commit";
import { compose, definePlugin } from "@shanepadgett/liminal-core";
import directories from "@shanepadgett/liminal-directories";
import environment from "@shanepadgett/liminal-environment";
import history from "@shanepadgett/liminal-history";
import instructions from "@shanepadgett/liminal-instructions";
import loop from "@shanepadgett/liminal-loop";
import memory from "@shanepadgett/liminal-memory";
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
import questions from "@shanepadgett/liminal-questions";
import session from "@shanepadgett/liminal-session";
import sessionName from "@shanepadgett/liminal-session-name";
import sessionPicker from "@shanepadgett/liminal-session-picker";
import settings from "@shanepadgett/liminal-settings";
import skills from "@shanepadgett/liminal-skills";
import slash from "@shanepadgett/liminal-slash";
import sqlite from "@shanepadgett/liminal-sqlite";
import stash from "@shanepadgett/liminal-stash";
import systemPrompt from "@shanepadgett/liminal-system-prompt";
import tags from "@shanepadgett/liminal-tags";
import theme from "@shanepadgett/liminal-theme";
import toolDefinitions from "@shanepadgett/liminal-tool-definitions";
import toolOutput from "@shanepadgett/liminal-tool-output";
import tools from "@shanepadgett/liminal-tools";
import toolsEdit from "@shanepadgett/liminal-tools-edit";
import toolsProcesses from "@shanepadgett/liminal-tools-processes";
import toolsRead from "@shanepadgett/liminal-tools-read";
import toolsShell from "@shanepadgett/liminal-tools-shell";
import toolsWeb from "@shanepadgett/liminal-tools-web";
import toolsWrite from "@shanepadgett/liminal-tools-write";
import usage from "@shanepadgett/liminal-usage";
import webSearchAnthropic from "@shanepadgett/liminal-web-search-anthropic";
import webSearchOpenai from "@shanepadgett/liminal-web-search-openai";

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
  toolsRead,
  toolsEdit,
  toolsWrite,
  toolsShell,
  toolsProcesses,
  toolsWeb,
  webSearchAnthropic,
  webSearchOpenai,
  toolOutput,
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
  usage,
  memory,
  sessionName,
  questions,
  approvals,
  skills,
  commit,
  stash,
  slash,
  palette,
  sessionPicker,
] as const;

/** The client host, with the composition built behind it. */
export const host = Layer.provide(inMemory, compose(plugins));
