/** Tool-registry's server: the empty Tools registry, named by each tool's spec name. */

import { KeyedRegistry } from "@liminal/sdk";

import { Tools } from "./contract.ts";

export const layer = KeyedRegistry.layer(Tools, (tool) => tool.spec.name);
