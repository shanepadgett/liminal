/**
 * The notification sound, played by the system's player: `afplay` on macOS; on Linux the first
 * installed of `paplay`, `pw-play` or `aplay`. With none installed nothing plays.
 */

import { fileURLToPath } from "node:url";

import { Effect, Option } from "effect";

const SOUND = fileURLToPath(new URL("../../assets/notification.wav", import.meta.url));

const PLAYERS: Readonly<Record<string, ReadonlyArray<string>>> = {
  darwin: ["afplay"],
  linux: ["paplay", "pw-play", "aplay"],
};

/** The first of this system's players that is installed. */
export const playerOf = (platform: string, which: (name: string) => string | null) =>
  Option.fromUndefinedOr((PLAYERS[platform] ?? []).find((name) => which(name) !== null));

/** Starts the sound with `player` and does not wait for it; a failure to start is logged. */
export const playWith = (player: string) =>
  Effect.try(() => {
    Bun.spawn([player, SOUND], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  }).pipe(
    Effect.catch((error) => Effect.logWarning("Could not play the notification sound.", error)),
  );
