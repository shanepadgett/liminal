/** Tools the model can call: the registry tool plugins add to. */

import { KeyedRegistry, type Tool } from "@liminal/sdk";

/** The tools by name, newest build first; a tool plugin registers its tools in its server's scope. */
export class Tools extends KeyedRegistry.Service<Tools, Tool>()("liminal/tool-registry/Tools") {}
