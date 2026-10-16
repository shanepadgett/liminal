import {
  contractImports,
  contractNoSideEffects,
  manifestImports,
  partIsolation,
} from "./plugin-rules.ts";
import { testRule } from "./rule-tester.ts";

const contract = "plugins/demo/src/contract.ts";
const manifest = "plugins/demo/plugin.ts";

testRule("contract-imports", contractImports, {
  valid: [
    { filename: contract, code: 'import { Context } from "effect";' },
    { filename: contract, code: 'import * as Schema from "effect/Schema";' },
    { filename: contract, code: 'import type { Sdk } from "@liminal/sdk";' },
    { filename: "plugins/demo/src/server.ts", code: 'import { readFile } from "node:fs";' },
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
  ],
});

testRule("contract-no-side-effects", contractNoSideEffects, {
  valid: [
    {
      filename: contract,
      code: 'import { Context } from "effect";\nexport interface Thing { readonly id: string }\nexport const limit = 3;',
    },
    { filename: "plugins/demo/src/server.ts", code: 'console.log("ok");' },
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
  ],
});

testRule("part-isolation", partIsolation, {
  valid: [
    { filename: "plugins/demo/src/server.ts", code: 'import { Demo } from "./contract.ts";' },
    { filename: "plugins/demo/src/server/store.ts", code: 'import { serve } from "../server.ts";' },
    { filename: "plugins/demo/src/tui/view.tsx", code: 'import { Demo } from "../contract.ts";' },
  ],
  invalid: [
    {
      filename: "plugins/demo/src/server.ts",
      code: 'import { View } from "./tui.tsx";',
      errors: 1,
    },
    {
      filename: "plugins/demo/src/tui.tsx",
      code: 'import { serve } from "./server/store.ts";',
      errors: 1,
    },
    { filename: "plugins/demo/src/tui/view.tsx", code: 'export * from "../server.ts";', errors: 1 },
  ],
});
