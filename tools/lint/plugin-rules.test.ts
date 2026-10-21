import {
  contractImports,
  contractNoSideEffects,
  entryIsolation,
  pluginImports,
} from "./plugin-rules.ts";
import { testRule } from "./rule-tester.ts";

const contract = "packages/plugins/demo/src/contract.ts";
const plugin = "packages/plugins/demo/src/index.ts";
const tui = "packages/plugins/demo/src/tui.tsx";
const web = "packages/plugins/demo/src/web.tsx";

testRule("contract-imports", contractImports, {
  valid: [
    { filename: contract, code: 'import { Context } from "effect";' },
    { filename: contract, code: 'import * as Schema from "effect/Schema";' },
    { filename: contract, code: 'import type { Registry } from "@shanepadgett/liminal-core";' },
    {
      filename: contract,
      code: 'import type { Other } from "@shanepadgett/liminal-other/contract";',
    },
    {
      filename: contract,
      code: 'export type { Other } from "@shanepadgett/liminal-other/contract";',
    },
    { filename: plugin, code: 'import { readFile } from "node:fs";' },
  ],
  invalid: [
    { filename: contract, code: 'import { readFile } from "node:fs";', errors: 1 },
    { filename: contract, code: 'export { x } from "./index.ts";', errors: 1 },
    { filename: contract, code: 'import { x } from "@shanepadgett/liminal-other";', errors: 1 },
    { filename: contract, code: 'import { x } from "@shanepadgett/liminal-other/tui";', errors: 1 },
    { filename: contract, code: 'import { x } from "@shanepadgett/liminal-client";', errors: 1 },
    {
      filename: contract,
      code: 'const m = import("@shanepadgett/liminal-other/contract");',
      errors: 1,
    },
    { filename: contract, code: 'const m = import("zod");', errors: 1 },
  ],
});

testRule("contract-no-side-effects", contractNoSideEffects, {
  valid: [
    {
      filename: contract,
      code: 'import { Context } from "effect";\nexport interface Thing { readonly id: string }\nexport const limit = 3;',
    },
    { filename: plugin, code: 'console.log("ok");' },
  ],
  invalid: [
    { filename: contract, code: 'console.log("loaded");', errors: 1 },
    { filename: contract, code: "if (Math.random() > 0.5) {}", errors: 1 },
  ],
});

testRule("plugin-imports", pluginImports, {
  valid: [
    { filename: plugin, code: 'import { definePlugin } from "@shanepadgett/liminal-core";' },
    {
      filename: plugin,
      code: 'import { SessionLog } from "@shanepadgett/liminal-session/contract";',
    },
    { filename: tui, code: 'import { Panel } from "@shanepadgett/liminal-tui";' },
    { filename: web, code: 'import { connect } from "@shanepadgett/liminal-client";' },
    {
      filename: "packages/client/src/host.ts",
      code: 'import { SessionRpc } from "@shanepadgett/liminal-session/contract";',
    },
    {
      filename: "apps/cli/src/main.ts",
      code: 'import session from "@shanepadgett/liminal-session";',
    },
  ],
  invalid: [
    { filename: plugin, code: 'import session from "@shanepadgett/liminal-session";', errors: 1 },
    {
      filename: "packages/client/src/host.ts",
      code: 'import session from "@shanepadgett/liminal-session";',
      errors: 1,
    },
    { filename: tui, code: 'import { View } from "@shanepadgett/liminal-chat/tui";', errors: 1 },
    {
      filename: contract,
      code: 'export * from "@shanepadgett/liminal-model/src/index.ts";',
      errors: 1,
    },
  ],
});

testRule("entry-isolation", entryIsolation, {
  valid: [
    { filename: plugin, code: 'import { Demo } from "./contract.ts";' },
    { filename: plugin, code: 'const tui = () => import("./tui.tsx");' },
    { filename: "packages/plugins/demo/src/store.ts", code: 'import "./index.ts";' },
    { filename: "packages/plugins/demo/src/store/rows.ts", code: 'import "../store.ts";' },
    { filename: "packages/plugins/demo/src/tui/view.tsx", code: 'import "../contract.ts";' },
  ],
  invalid: [
    { filename: plugin, code: 'import { View } from "./tui.tsx";', errors: 1 },
    { filename: plugin, code: 'import { View } from "./web/view.tsx";', errors: 1 },
    { filename: tui, code: 'import { store } from "./store.ts";', errors: 1 },
    { filename: tui, code: 'import { rows } from "./store/rows.ts";', errors: 1 },
    { filename: tui, code: 'const web = () => import("./web.tsx");', errors: 1 },
    {
      filename: "packages/plugins/demo/src/web/view.tsx",
      code: 'export * from "../tui.tsx";',
      errors: 1,
    },
  ],
});
