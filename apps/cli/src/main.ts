#!/usr/bin/env bun
/** Liminal command-line entry point. */
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect } from "effect";

import { kernelName } from "@liminal/kernel";

BunRuntime.runMain(Console.log(kernelName).pipe(Effect.asVoid));
