/**
 * The TUI over the built-in plugins: every UI part loads, the chat screen opens the most recent
 * session, and a prompt typed in the composer runs a turn on the scripted provider.
 */

import { expect } from "bun:test";

import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { Context, Effect, Latch, Option, Path, Predicate, Queue, Schedule, Stream } from "effect";
import { ChildProcess } from "effect/process";
import { TestClock } from "effect/testing";

import { startFrontend } from "@liminal/frontend";
import { type Kernel, type ReloadOptions, start } from "@liminal/kernel";
import {
  reply,
  replyText,
  type Script,
  ScriptedModel,
  scriptedProvider,
} from "@liminal/model-scripted/contract";
import { type ModelPart, SessionId } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";
import { TuiHost } from "@liminal/sdk/tui";
import { SessionLog, userMessage } from "@liminal/session-log/contract";
import { Settings } from "@liminal/settings/contract";

import { mount } from "../src/tui/run.tsx";
import { awaitRebuild, bootOptions, testReload } from "./support.ts";

const s1 = SessionId.make("s1");

const parts = ["cancel", "chat", "inbox", "reload", "tools-file", "tools-shell"];

/**
 * Boots the kernel, with `reload` when given, prepares it with `before`, then mounts the TUI once
 * every part runs.
 */
const boot = Effect.fn("boot")(function* <E>(
  before: (kernel: Kernel) => Effect.Effect<void, E>,
  reload?: ReloadOptions,
) {
  const path = yield* Path.Path;

  const options = bootOptions(path, {
    extra: [path.resolve(import.meta.dir, "plugins")],
    parts: ["tui"],
  });

  const kernel = yield* start(reload === undefined ? options : { ...options, reload });

  yield* before(kernel);

  const frontend = yield* startFrontend({
    graph: kernel.graph,
    connect: kernel.connect,
    host: TuiHost,
    part: (member) => member.parts.tui,
  });

  // Parts that load before chat declares its slots wait, then run once it does.
  yield* frontend.statuses.pipe(
    Stream.filter((each) => parts.every((name) => Predicate.isTagged(each.get(name), "Running"))),
    Stream.runHead,
  );

  const setup = yield* Effect.acquireRelease(
    Effect.promise(() => createTestRenderer({ width: 80, height: 24 })),
    ({ renderer }) =>
      Effect.sync(() => {
        renderer.destroy();
      }),
  );

  yield* mount(frontend, setup.renderer);

  return { kernel, setup };
});

/**
 * The first frame `shows` accepts. The kernel's work arrives between frames, so it polls on the
 * real clock.
 */
const frameWhere = (setup: TestRendererSetup, shows: (frame: string) => boolean) =>
  Effect.promise(() => setup.renderOnce()).pipe(
    Effect.map(() => setup.captureCharFrame()),
    Effect.filterOrFail(shows),
    Effect.retry({ schedule: Schedule.spaced("10 millis"), times: 300 }),
    TestClock.withLive,
  );

/** The first frame that contains `text`. */
const frameWith = (setup: TestRendererSetup, text: string) =>
  frameWhere(setup, (frame) => frame.includes(text));

effectTest(
  "the chat screen loads every UI part and shows the most recent session",
  Effect.gen(function* () {
    const { setup } = yield* boot((kernel) =>
      kernel.use((services) => {
        const log = Context.getUnsafe(services, SessionLog);

        return log.create(s1).pipe(Effect.andThen(log.append(s1, [userMessage("hello there")])));
      }),
    );

    expect(yield* frameWith(setup, "hello there")).toContain("enter send");
  }),
  testBaseServices,
);

/** Boots with the scripted model as the default, answering each call with the next of `scripts`. */
const bootScripted = (...scripts: ReadonlyArray<Script>) =>
  boot((kernel) =>
    kernel.use((services) =>
      Effect.gen(function* () {
        yield* Context.getUnsafe(services, Settings).write("global", ["agent-loop", "model"], {
          provider: scriptedProvider,
          id: "scripted",
        });

        yield* Context.getUnsafe(services, ScriptedModel).enqueue(...scripts);
      }),
    ),
  );

/** Types `text` into the composer and sends it. */
const send = (setup: TestRendererSetup, text: string) =>
  Effect.gen(function* () {
    yield* frameWith(setup, "Ask anything");
    yield* Effect.promise(() => setup.mockInput.typeText(text));
    setup.mockInput.pressEnter();
  });

effectTest(
  "a prompt sent from the composer shows in the transcript with the model's reply",
  Effect.gen(function* () {
    const { setup } = yield* bootScripted(replyText("hi, how can I help"));

    yield* send(setup, "hello");

    expect(yield* frameWith(setup, "hi, how can I help")).toContain("hello");
  }),
  testBaseServices,
);

effectTest(
  "a tool call the model makes shows as a work row worded by the tool's plugin",
  Effect.gen(function* () {
    const read: ModelPart = {
      type: "tool-call",
      id: "c1",
      name: "read",
      params: { path: import.meta.path },
      providerData: {},
    };

    const { setup } = yield* bootScripted(reply([read]), replyText("read it"));

    yield* send(setup, "look at the test");

    const frame = yield* frameWith(setup, "read it");
    expect(frame).toContain("◆ Read");
  }),
  testBaseServices,
);

effectTest(
  "esc interrupts the running turn",
  Effect.gen(function* () {
    const gate = yield* Latch.make();
    const { setup } = yield* bootScripted([{ type: "gate", gate }, ...replyText("never")]);

    yield* send(setup, "wait for it");
    yield* frameWith(setup, "esc interrupt");
    setup.mockInput.pressEscape();

    const after = yield* frameWhere(setup, (frame) => !frame.includes("esc interrupt"));

    expect(after).toContain("wait for it");
    expect(after).not.toContain("never");
  }),
  testBaseServices,
);

effectTest(
  "the header offers ctrl+r once a checked reload waits, and ctrl+r applies it",
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const changes = yield* Queue.unbounded<ReadonlyArray<string>>();
    const { kernel, setup } = yield* boot(() => Effect.void, testReload(changes, "confirmed"));
    const file = path.resolve(import.meta.dir, "../../../packages/plugins/cancel/src/tui.tsx");

    const reload = Effect.gen(function* () {
      yield* Queue.offer(changes, [file]);
      yield* frameWith(setup, "ctrl+r reload");
      setup.mockInput.pressKey("r", { ctrl: true });
    });

    yield* awaitRebuild(kernel.graph, "cancel", reload);

    const after = yield* frameWhere(setup, (frame) => !frame.includes("ctrl+r reload"));
    expect(after).toContain("liminal");
  }),
  testBaseServices,
);

effectTest(
  "the header shows why a reload's check failed",
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const changes = yield* Queue.unbounded<ReadonlyArray<string>>();
    const broken = ChildProcess.make("/bin/sh", ["-c", "echo 'error TS2322: broken'; exit 1"]);
    const reload = { ...testReload(changes, "confirmed"), typecheck: Option.some(broken) };
    const { setup } = yield* boot(() => Effect.void, reload);
    const file = path.resolve(import.meta.dir, "../../../packages/plugins/cancel/src/tui.tsx");

    yield* Queue.offer(changes, [file]);

    expect(yield* frameWith(setup, "reload failed")).toContain("error TS2322: broken");
  }),
  testBaseServices,
);
