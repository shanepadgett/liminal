import { layer } from "../src/server.ts";
import { sessionStoreConformance } from "./conformance.ts";

/** Both layers open sessions.db in the same test data folder, so `reopen` sees what `layer` saved. */
sessionStoreConformance("sqlite", () => ({ layer, reopen: layer }));
