/** `trust/workspace` and `trust/trust` over the base `ProjectTrust`. */

import { expect } from "bun:test";

import { Effect, Layer } from "effect";
import { RpcTest } from "effect/rpc";

import { Directories } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";

import trust from "../plugin.ts";
import { TrustRpcs } from "../src/contract.ts";

effectTest(
  "the workspace starts untrusted and reads trusted once trusted",
  Effect.gen(function* () {
    const { workspace } = yield* Directories;
    const client = yield* RpcTest.makeClient(TrustRpcs);

    expect(yield* client["trust/workspace"]()).toEqual({ workspace, trusted: false });

    yield* client["trust/trust"]();
    expect(yield* client["trust/workspace"]()).toEqual({ workspace, trusted: true });
  }),
  serverOf(trust).pipe(Layer.provideMerge(testBaseServices)),
);
