/** The in-memory fake behaves like a real SessionStore. */

import { sessionStoreConformance } from "@liminal/session-store/conformance";

import { memoryStore } from "./memory-store.ts";

sessionStoreConformance("memory", () => ({ layer: memoryStore }));
