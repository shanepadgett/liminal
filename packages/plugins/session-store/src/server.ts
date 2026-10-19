/** Session-store's server: the SQLite store at `sessions.db` in the data folder. */

import { Effect, Layer } from "effect";

import { dataFile } from "@liminal/sdk";

import { sqliteStore } from "./server/sqlite-store.ts";

export const layer = Layer.unwrap(Effect.map(dataFile("sessions.db"), sqliteStore));
