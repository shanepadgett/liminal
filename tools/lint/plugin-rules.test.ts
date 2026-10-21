import {
  contractImports,
  contractNoSideEffects,
  entryIsolation,
  pluginImports,
} from "./plugin-rules.ts";
import { testRule } from "./rule-tester.ts";

const contract = "packages/plugins/demo/src/contract.ts";
const plugin = "packages/plugins/demo/src/plugin.ts";
const tui = "packages/plugins/demo/src/tui.tsx";
const web = "packages/plugins/demo/src/web.tsx";

testRule("contract-imports", contractImports, {
  valid: [
    { filename: contract, code: 'import { Context } from "effect";' },
    { filename: contract, code: 'import * as Schema from "effect/Schema";' },
    { filename: contract, code: 'import type { Registry } from "@liminal/core";' },
    { filename: contract, code: 'import type { Other } from "@liminal/other/contract";' },
    { filename: contract, code: 'export type { Other } from "@liminal/other/contract";' },
    { filename: plugin, code: 'import { readFile } from "node:fs";' },
  ],
  invalid: [
    { filename: contract, code: 'import { readFile } from "node:fs";', errors: 1 },
    { filename: contract, code: 'export { x } from "./plugin.ts";', errors: 1 },
    { filename: contract, code: 'import { x } from "@liminal/other";', errors: 1 },
    { filename: contract, code: 'import { x } from "@liminal/other/tui";', errors: 1 },
    { filename: contract, code: 'import { x } from "@liminal/client";', errors: 1 },
    { filename: contract, code: 'const m = import("@liminal/other/contract");', errors: 1 },
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
    { filename: plugin, code: 'import { definePlugin } from "@liminal/core";' },
    { filename: plugin, code: 'import { SessionLog } from "@liminal/session/contract";' },
    { filename: tui, code: 'import { Panel } from "@liminal/tui";' },
    { filename: web, code: 'import { connect } from "@liminal/client";' },
    { filename: "apps/cli/src/main.ts", code: 'import session from "@liminal/session";' },
  ],
  invalid: [
    { filename: plugin, code: 'import session from "@liminal/session";', errors: 1 },
    { filename: tui, code: 'import { View } from "@liminal/chat/tui";', errors: 1 },
    { filename: contract, code: 'export * from "@liminal/model/src/plugin.ts";', errors: 1 },
  ],
});

testRule("entry-isolation", entryIsolation, {
  valid: [
    { filename: plugin, code: 'import { Demo } from "./contract.ts";' },
    { filename: plugin, code: 'const tui = () => import("./tui.tsx");' },
    { filename: "packages/plugins/demo/src/plugin/store.ts", code: 'import "../plugin.ts";' },
    { filename: "packages/plugins/demo/src/tui/view.tsx", code: 'import "../contract.ts";' },
  ],
  invalid: [
    { filename: plugin, code: 'import { View } from "./tui.tsx";', errors: 1 },
    { filename: plugin, code: 'import { View } from "./web/view.tsx";', errors: 1 },
    { filename: tui, code: 'import { store } from "./plugin/store.ts";', errors: 1 },
    { filename: tui, code: 'const web = () => import("./web.tsx");', errors: 1 },
    {
      filename: "packages/plugins/demo/src/web/view.tsx",
      code: 'export * from "../tui.tsx";',
      errors: 1,
    },
  ],
});
