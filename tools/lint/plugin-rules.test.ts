import {
  conformanceImports,
  contractImports,
  contractNoSideEffects,
  manifestImports,
  partIsolation,
  serverImports,
  testingImports,
} from "./plugin-rules.ts";
import { testRule } from "./rule-tester.ts";

const contract = "packages/plugins/demo/src/contract.ts";
const manifest = "packages/plugins/demo/plugin.ts";

testRule("contract-imports", contractImports, {
  valid: [
    { filename: contract, code: 'import { Context } from "effect";' },
    { filename: contract, code: 'import * as Schema from "effect/Schema";' },
    { filename: contract, code: 'import type { Sdk } from "@liminal/sdk";' },
    {
      filename: "packages/plugins/demo/src/server.ts",
      code: 'import { readFile } from "node:fs";',
    },
  ],
  invalid: [
    { filename: contract, code: 'import { readFile } from "node:fs";', errors: 1 },
    { filename: contract, code: 'export { x } from "./server.ts";', errors: 1 },
    {
      filename: contract,
      code: 'export type { Other } from "@liminal/other/contract";',
      errors: 1,
    },
    { filename: contract, code: 'const m = import("zod");', errors: 1 },
    { filename: contract, code: 'import { effectTest } from "@liminal/sdk/testing";', errors: 1 },
  ],
});

testRule("contract-no-side-effects", contractNoSideEffects, {
  valid: [
    {
      filename: contract,
      code: 'import { Context } from "effect";\nexport interface Thing { readonly id: string }\nexport const limit = 3;',
    },
    { filename: "packages/plugins/demo/src/server.ts", code: 'console.log("ok");' },
  ],
  invalid: [
    { filename: contract, code: 'console.log("loaded");', errors: 1 },
    { filename: contract, code: "if (Math.random() > 0.5) {}", errors: 1 },
  ],
});

testRule("manifest-imports", manifestImports, {
  valid: [
    { filename: manifest, code: 'import { definePlugin } from "@liminal/sdk";' },
    { filename: manifest, code: 'import { Demo } from "./src/contract.ts";' },
    { filename: manifest, code: 'import { Log } from "@liminal/session-log/contract";' },
    { filename: manifest, code: 'const load = () => import("./src/server.ts");' },
  ],
  invalid: [
    { filename: manifest, code: 'import { serve } from "./src/server.ts";', errors: 1 },
    { filename: manifest, code: 'import { kernel } from "@liminal/kernel";', errors: 1 },
    { filename: manifest, code: 'import { Effect } from "effect";', errors: 1 },
    { filename: manifest, code: 'import { Theme } from "@liminal/sdk/tui";', errors: 1 },
  ],
});

const server = "packages/plugins/demo/src/server.ts";

testRule("server-imports", serverImports, {
  valid: [
    { filename: server, code: 'import { Registry } from "@liminal/sdk";' },
    {
      filename: "packages/plugins/demo/src/tui.tsx",
      code: 'import { Box } from "@opentui/solid";',
    },
  ],
  invalid: [
    { filename: server, code: 'import { Theme } from "@liminal/sdk/tui";', errors: 1 },
    { filename: server, code: 'import { Window } from "@liminal/sdk/desktop";', errors: 1 },
    {
      filename: "packages/plugins/demo/src/server/view.ts",
      code: 'import "@opentui/core";',
      errors: 1,
    },
  ],
});

const testing = 'import { effectTest } from "@liminal/sdk/testing";';

testRule("testing-imports", testingImports, {
  valid: [
    { filename: "packages/plugins/demo/test/demo.test.ts", code: testing },
    { filename: "packages/kernel/test/host.test.ts", code: testing },
    { filename: "packages/kernel/src/host/host.test.ts", code: testing },
  ],
  invalid: [
    { filename: server, code: testing, errors: 1 },
    { filename: "packages/kernel/src/host/host.ts", code: testing, errors: 1 },
  ],
});

const conformance = 'import { storeConformance } from "@liminal/session-store/conformance";';

testRule("conformance-imports", conformanceImports, {
  valid: [
    { filename: "packages/plugins/demo/test/store.test.ts", code: conformance },
    { filename: server, code: 'import { Store } from "@liminal/session-store/contract";' },
  ],
  invalid: [
    { filename: server, code: conformance, errors: 1 },
    { filename: manifest, code: conformance, errors: 1 },
    { filename: "packages/kernel/src/host/host.ts", code: conformance, errors: 1 },
  ],
});

testRule("part-isolation", partIsolation, {
  valid: [
    {
      filename: "packages/plugins/demo/src/server.ts",
      code: 'import { Demo } from "./contract.ts";',
    },
    {
      filename: "packages/plugins/demo/src/server/store.ts",
      code: 'import { serve } from "../server.ts";',
    },
    {
      filename: "packages/plugins/demo/src/tui/view.tsx",
      code: 'import { Demo } from "../contract.ts";',
    },
  ],
  invalid: [
    {
      filename: "packages/plugins/demo/src/server.ts",
      code: 'import { View } from "./tui.tsx";',
      errors: 1,
    },
    {
      filename: "packages/plugins/demo/src/tui.tsx",
      code: 'import { serve } from "./server/store.ts";',
      errors: 1,
    },
    {
      filename: "packages/plugins/demo/src/tui/view.tsx",
      code: 'export * from "../server.ts";',
      errors: 1,
    },
  ],
});
