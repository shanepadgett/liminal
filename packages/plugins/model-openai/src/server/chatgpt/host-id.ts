/**
 * The host id that names this machine to OpenAI on Sign in with ChatGPT, kept in `host-id` in the
 * data folder, apart from the credentials, so a copy of the credentials does not carry it.
 */

import { Crypto, Effect, FileSystem, Path } from "effect";

import { Directories } from "@liminal/sdk";

/** Gives `read`, which reads the host id and makes and saves one on first use. */
export const makeHostId = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const folder = (yield* Directories).data;
  const filename = path.join(folder, "host-id");

  const read = Effect.gen(function* () {
    if (yield* fs.exists(filename)) return (yield* fs.readFileString(filename)).trim();

    // OpenAI accepts a `urn:uuid:` URI built from a UUIDv4.
    const hostId = `urn:uuid:${yield* crypto.randomUUIDv4()}`;
    yield* fs.makeDirectory(folder, { recursive: true });
    yield* fs.writeFileString(filename, `${hostId}\n`);

    return hostId;
  });

  return { read };
});
