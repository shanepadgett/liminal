/**
 * The TUI over the built-in plugins: every UI part loads, the chat screen opens the most recent
 * session, and a prompt typed in the composer runs a turn on the scripted provider.
 */

import { expect } from "bun:test";

import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import {
  Context,
  Deferred,
  Effect,
  Latch,
  Layer,
  Option,
  Path,
  Predicate,
  Queue,
  Schedule,
  Stream,
} from "effect";
import { ChildProcess } from "effect/process";
import { TestClock } from "effect/testing";

import { ApprovalEntry } from "@liminal/approval/contract";
import { type Handoff, startFrontend } from "@liminal/frontend";
import { type Kernel, type ReloadOptions, start } from "@liminal/kernel";
import {
  reply,
  replyText,
  type Script,
  ScriptedModel,
  scriptedProvider,
} from "@liminal/model-scripted/contract";
import {
  Directories,
  draft,
  ModelError,
  type ModelPart,
  ProjectTrust,
  SessionId,
} from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";
import { SessionLog, userMessage } from "@liminal/session-log/contract";
import { Settings } from "@liminal/settings/contract";

import { makeTerminal, mount, tuiServices } from "../src/tui/run.tsx";
import { Pins } from "./plugins/pins/src/contract.ts";
import { awaitRebuild, bootOptions, testReload } from "./support.ts";

const s1 = SessionId.make("s1");

const parts = [
  "agent-loop",
  "cancel",
  "chat",
  "inbox",
  "logins",
  "palette",
  "reload",
  "tools-edit",
  "tools-read",
  "tools-shell",
  "trust",
];

/** The base services with the workspace trusted, so the composer shows. */
const trustedServices = testBaseServices.pipe(
  Layer.tap((services) => Context.get(services, ProjectTrust).trust),
);

/**
 * Boots the kernel, with `reload` when given, prepares it with `before`, then mounts the TUI once
 * every part runs.
 */
const boot = Effect.fn("boot")(function* <E>(
  before: (kernel: Kernel) => Effect.Effect<void, E>,
  reload?: ReloadOptions,
  handoff: Handoff = {},
) {
  const path = yield* Path.Path;

  const options = bootOptions(path, {
    extra: [path.resolve(import.meta.dir, "plugins")],
    parts: ["tui"],
  });

  const kernel = yield* start(reload === undefined ? options : { ...options, reload });

  yield* before(kernel);

  const setup = yield* Effect.acquireRelease(
    Effect.promise(() => createTestRenderer({ width: 80, height: 24, kittyKeyboard: true })),
    ({ renderer }) =>
      Effect.sync(() => {
        renderer.destroy();
      }),
  );

  const terminal = yield* makeTerminal(setup.renderer);

  const frontend = yield* startFrontend({
    graph: kernel.graph,
    connect: kernel.connect,
    services: tuiServices(terminal),
    part: (member) => member.parts.tui,
    handoff,
  });

  // Parts that load before chat declares its slots wait, then run once it does.
  yield* frontend.statuses.pipe(
    Stream.filter((each) => parts.every((name) => Predicate.isTagged(each.get(name), "Running"))),
    Stream.runHead,
  );

  const quit = yield* mount(frontend, terminal);

  return { kernel, setup, quit, frontend };
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
  "the chat screen loads every UI part and starts blank, not on the most recent session",
  Effect.gen(function* () {
    const { setup } = yield* boot((kernel) =>
      kernel.use((services) => {
        const log = Context.getUnsafe(services, SessionLog);

        return log.create(s1).pipe(Effect.andThen(log.append(s1, [userMessage("hello there")])));
      }),
    );

    const frame = yield* frameWith(setup, "enter send");
    expect(frame).toContain("Ask anything");
    expect(frame).not.toContain("hello there");
  }),
  trustedServices,
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
  trustedServices,
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
  trustedServices,
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
  trustedServices,
);

effectTest(
  "the header offers ctrl+r once a checked reload waits, and ctrl+r applies it",
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const changes = yield* Queue.unbounded<ReadonlyArray<string>>();

    const { kernel, setup } = yield* boot(
      () => Effect.void,
      testReload(path, changes, "confirmed"),
    );

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
  trustedServices,
);

effectTest(
  "the composer keeps its draft when its plugin reloads",
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const changes = yield* Queue.unbounded<ReadonlyArray<string>>();

    const { kernel, setup } = yield* boot(() => Effect.void, testReload(path, changes));
    const file = path.resolve(import.meta.dir, "../../../packages/plugins/inbox/src/tui.tsx");

    yield* frameWith(setup, "Ask anything");
    yield* Effect.promise(() => setup.mockInput.typeText("keep me"));
    yield* frameWith(setup, "keep me");
    yield* awaitRebuild(kernel.graph, "inbox", Queue.offer(changes, [file]));
    yield* frameWith(setup, "keep me");
    yield* Effect.promise(() => setup.mockInput.typeText(" too"));

    expect(yield* frameWith(setup, "keep me too")).not.toContain("Ask anything");
  }),
  trustedServices,
);

effectTest(
  "the header shows why a reload's check failed",
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const changes = yield* Queue.unbounded<ReadonlyArray<string>>();
    const broken = ChildProcess.make("/bin/sh", ["-c", "echo 'error TS2322: broken'; exit 1"]);
    const reload = { ...testReload(path, changes, "confirmed"), typecheck: Option.some(broken) };
    const { setup } = yield* boot(() => Effect.void, reload);
    const file = path.resolve(import.meta.dir, "../../../packages/plugins/cancel/src/tui.tsx");

    yield* Queue.offer(changes, [file]);

    expect(yield* frameWith(setup, "reload failed")).toContain("error TS2322: broken");
  }),
  trustedServices,
);

effectTest(
  "typing a slash opens the menu of matching commands",
  Effect.gen(function* () {
    const { setup } = yield* boot(() => Effect.void);

    yield* frameWith(setup, "Ask anything");
    yield* Effect.promise(() => setup.mockInput.typeText("/rel"));

    expect(yield* frameWith(setup, "/reload")).toContain("Apply a reload that waits");
  }),
  trustedServices,
);

effectTest(
  "enter on the slash menu runs the highlighted command",
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const changes = yield* Queue.unbounded<ReadonlyArray<string>>();

    const { kernel, setup } = yield* boot(
      () => Effect.void,
      testReload(path, changes, "confirmed"),
    );

    const file = path.resolve(import.meta.dir, "../../../packages/plugins/cancel/src/tui.tsx");

    const reload = Effect.gen(function* () {
      yield* Queue.offer(changes, [file]);
      yield* frameWith(setup, "ctrl+r reload");
      yield* Effect.promise(() => setup.mockInput.typeText("/rel"));
      yield* frameWith(setup, "Apply a reload that waits");
      setup.mockInput.pressEnter();
    });

    yield* awaitRebuild(kernel.graph, "cancel", reload);

    const after = yield* frameWhere(setup, (frame) => !frame.includes("ctrl+r reload"));
    expect(after).not.toContain("/reload");
  }),
  trustedServices,
);

effectTest(
  "a slash word that names no command is sent as a prompt",
  Effect.gen(function* () {
    const { setup } = yield* bootScripted(replyText("not a command"));

    yield* send(setup, "/nope hi");

    expect(yield* frameWith(setup, "not a command")).toContain("/nope hi");
  }),
  trustedServices,
);

effectTest(
  "the composer grows with each new line of the draft",
  Effect.gen(function* () {
    const { setup } = yield* boot(() => Effect.void);

    yield* frameWith(setup, "Ask anything");

    yield* Effect.promise(() => setup.mockInput.typeText("one"));

    for (const line of ["two", "three", "four"]) {
      setup.mockInput.pressEnter({ shift: true });
      yield* Effect.promise(() => setup.mockInput.typeText(line));
    }

    // Each line shows, and a blank row still sits between the last one and the model line.
    const grown = /one *\n *two *\n *three *\n *four *\n *\n *No model is set/;
    expect(yield* frameWhere(setup, (frame) => grown.test(frame))).toMatch(grown);
  }),
  trustedServices,
);

effectTest(
  "ctrl+c closes the open dialog, then clears the draft, then quits",
  Effect.gen(function* () {
    const { setup, quit } = yield* boot(() => Effect.void);

    yield* frameWith(setup, "Ask anything");
    yield* Effect.promise(() => setup.mockInput.typeText("draft words"));
    setup.mockInput.pressKey("p", { ctrl: true });
    yield* frameWith(setup, "Type to filter");

    setup.mockInput.pressKey("c", { ctrl: true });
    const closed = yield* frameWhere(setup, (frame) => !frame.includes("Type to filter"));
    expect(closed).toContain("draft words");

    setup.mockInput.pressKey("c", { ctrl: true });
    yield* frameWith(setup, "Ask anything");
    expect(yield* Deferred.isDone(quit)).toBe(false);

    setup.mockInput.pressKey("c", { ctrl: true });
    yield* Deferred.await(quit);
  }),
  trustedServices,
);

effectTest(
  "the keypad's enter sends the draft",
  Effect.gen(function* () {
    const { setup } = yield* bootScripted(replyText("got it"));

    yield* frameWith(setup, "Ask anything");
    yield* Effect.promise(() => setup.mockInput.typeText("hello"));
    // The kitty keyboard protocol's keypad enter.
    setup.mockInput.pressKey("\x1b[57414u");

    expect(yield* frameWith(setup, "got it")).toContain("hello");
  }),
  trustedServices,
);

effectTest(
  "ctrl+p lists the palette's commands with their keys, and enter runs one",
  Effect.gen(function* () {
    const { setup } = yield* boot(() => Effect.void);

    yield* frameWith(setup, "Ask anything");
    setup.mockInput.pressKey("p", { ctrl: true });

    const palette = yield* frameWith(setup, "Type to filter");
    expect(palette).toMatch(/Reload\s+ctrl\+r/);
    expect(palette).toMatch(/Quit\s+ctrl\+c/);
    expect(palette).toContain("New session");

    yield* Effect.promise(() => setup.mockInput.typeText("relo"));
    yield* frameWhere(setup, (frame) => !frame.includes("Quit"));
    setup.mockInput.pressEnter();

    expect(yield* frameWhere(setup, (frame) => !frame.includes("Type to filter"))).toContain(
      "Ask anything",
    );
  }),
  trustedServices,
);

effectTest(
  "the first prompt creates the session",
  Effect.gen(function* () {
    const { kernel, setup } = yield* bootScripted(replyText("hi there"));
    const sessions = kernel.use((services) => Context.getUnsafe(services, SessionLog).list);

    yield* frameWith(setup, "Ask anything");
    expect(yield* sessions).toHaveLength(0);

    yield* send(setup, "hello");
    yield* frameWith(setup, "hi there");
    expect(yield* sessions).toHaveLength(1);
  }),
  trustedServices,
);

effectTest(
  "a restart reopens the session and its draft",
  Effect.gen(function* () {
    const handoff = yield* Effect.scoped(
      Effect.gen(function* () {
        const { setup, frontend } = yield* bootScripted(replyText("hi there"));

        yield* send(setup, "hello");
        yield* frameWith(setup, "hi there");
        yield* Effect.promise(() => setup.mockInput.typeText("half written"));
        yield* frameWith(setup, "half written");

        return frontend.handoff();
      }),
    );

    const { setup } = yield* boot(() => Effect.void, undefined, handoff);

    expect(yield* frameWith(setup, "hi there")).toContain("half written");
  }),
  trustedServices,
);

effectTest(
  "/new opens a fresh session with an empty transcript",
  Effect.gen(function* () {
    const { setup } = yield* bootScripted(replyText("hi there"));

    yield* send(setup, "hello there");
    yield* frameWith(setup, "hi there");
    yield* Effect.promise(() => setup.mockInput.typeText("/new"));
    yield* frameWith(setup, "Start a fresh session");
    setup.mockInput.pressEnter();

    const fresh = yield* frameWhere(setup, (frame) => !frame.includes("hello there"));
    expect(fresh).toContain("Ask anything");
    expect(fresh).not.toContain("/new");
  }),
  trustedServices,
);

effectTest(
  "/sessions lists this folder's sessions by their first message and switches to the one picked",
  Effect.gen(function* () {
    const { setup } = yield* bootScripted(replyText("hi there"));

    yield* send(setup, "hello there");
    yield* frameWith(setup, "hi there");
    yield* Effect.promise(() => setup.mockInput.typeText("/new"));
    yield* frameWith(setup, "Start a fresh session");
    setup.mockInput.pressEnter();
    yield* frameWhere(setup, (frame) => !frame.includes("hi there"));

    yield* Effect.promise(() => setup.mockInput.typeText("/sessions"));
    yield* frameWith(setup, "Switch to a session");
    setup.mockInput.pressEnter();
    yield* frameWith(setup, "Sessions");
    yield* frameWith(setup, "hello there");
    setup.mockInput.pressEnter();

    expect(yield* frameWith(setup, "hi there")).toContain("hello there");
  }),
  trustedServices,
);

effectTest(
  "a turn stopped by a model error shows an error notice with a copy button",
  Effect.gen(function* () {
    const error = new ModelError({ reason: "auth", message: "token expired" });
    const { setup } = yield* bootScripted([{ type: "fail", error }]);

    yield* send(setup, "hello there");

    const frame = yield* frameWith(setup, "Sign-in rejected");
    const title = frame.split("\n").find((line) => line.includes("Sign-in rejected"));

    expect(title).toContain("copy");
    expect(frame).toContain("token expired");
  }),
  trustedServices,
);

/** Runs `command` from the composer's slash menu once its description shows. */
const slash = (setup: TestRendererSetup, command: string, desc: string) =>
  Effect.gen(function* () {
    yield* Effect.promise(() => setup.mockInput.typeText(command));
    yield* frameWith(setup, desc);
    setup.mockInput.pressEnter();
  });

effectTest(
  "approval answers show only while /debug turns the debug view on, with a toast saying which",
  Effect.gen(function* () {
    const { setup, kernel } = yield* bootScripted(replyText("hi there"));

    yield* send(setup, "hello there");
    yield* frameWith(setup, "hi there");

    yield* kernel.use((services) =>
      Effect.gen(function* () {
        const log = Context.getUnsafe(services, SessionLog);
        const [session] = yield* log.list;
        if (session === undefined) return yield* Effect.die("no session");

        const data = {
          callId: "c1",
          tool: "shell",
          by: "user",
          approved: false,
          reason: "not yet",
        };

        return yield* log.append(session.id, [draft(ApprovalEntry, { data, text: "rejected" })]);
      }),
    );

    yield* slash(setup, "/debug", "Show or hide debug entries");
    const shown = yield* frameWith(setup, "✕ shell rejected by you: not yet");
    expect(shown).toContain("Debug view on");

    yield* slash(setup, "/debug", "Show or hide debug entries");
    const hidden = yield* frameWhere(setup, (frame) => !frame.includes("shell rejected"));
    expect(hidden).toContain("Debug view off");
  }),
  trustedServices,
);

effectTest(
  "a third-party plugin from a plugin folder saves its own entry kind and draws it in the transcript",
  Effect.gen(function* () {
    const { setup, kernel } = yield* bootScripted(replyText("hi there"));

    yield* send(setup, "hello there");
    yield* frameWith(setup, "hi there");

    yield* kernel.use((services) =>
      Effect.gen(function* () {
        const [session] = yield* Context.getUnsafe(services, SessionLog).list;
        if (session === undefined) return yield* Effect.die("no session");

        return yield* Context.getUnsafe(services, Pins).pin(session.id, "remember this");
      }),
    );

    expect(yield* frameWith(setup, "pinned: remember this")).toContain("hi there");
  }),
  trustedServices,
);

effectTest(
  "/model sets the picked model and thinking option as the default, and the composer follows",
  Effect.gen(function* () {
    const { setup } = yield* boot(() => Effect.void);

    yield* frameWith(setup, "No model is set");
    yield* Effect.promise(() => setup.mockInput.typeText("/model"));
    yield* frameWith(setup, "Switch the model");
    setup.mockInput.pressEnter();

    expect(yield* frameWith(setup, "Models")).toContain("Scripted");
    setup.mockInput.pressEnter();

    expect(yield* frameWith(setup, "Thinking · ")).toContain("high");
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressEnter();

    expect(yield* frameWith(setup, "scripted (high)")).not.toContain("Type to filter");
  }),
  trustedServices,
);

effectTest(
  "/connect saves an OpenAI API key, closes, and then lists OpenAI as signed in",
  Effect.gen(function* () {
    const { setup } = yield* boot(() => Effect.void);

    yield* frameWith(setup, "Ask anything");
    yield* Effect.promise(() => setup.mockInput.typeText("/connect"));
    yield* frameWith(setup, "Sign in to a provider");
    setup.mockInput.pressEnter();

    const vendors = yield* frameWith(setup, "Connect a provider");

    for (const vendor of ["OpenAI", "OpenCode Go", "OpenRouter"]) expect(vendors).toContain(vendor);

    // Anthropic is listed first.
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressEnter();

    // OpenAI's methods are listed by id: chatgpt, codex, then the API key.
    yield* frameWith(setup, "Sign in with ChatGPT");
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressEnter();

    yield* frameWith(setup, "API key");
    yield* Effect.promise(() => setup.mockInput.typeText("sk-test"));
    setup.mockInput.pressEnter();

    yield* frameWhere(setup, (frame) => !frame.includes("OpenAI"));
    yield* Effect.promise(() => setup.mockInput.typeText("/connect"));
    yield* frameWith(setup, "Sign in to a provider");
    setup.mockInput.pressEnter();

    expect(yield* frameWith(setup, "signed in")).toContain("OpenAI");
  }),
  trustedServices,
);

effectTest(
  "an untrusted workspace opens with the trust prompt, and esc brings the composer back",
  Effect.gen(function* () {
    const { setup } = yield* boot(() => Effect.void);

    const frame = yield* frameWith(setup, "Trust this folder?");
    expect(frame).toContain("esc not now");
    expect(frame).not.toContain("Ask anything");

    setup.mockInput.pressEscape();
    yield* frameWith(setup, "Ask anything");
  }),
  testBaseServices,
);

effectTest(
  "enter on the trust prompt trusts the workspace",
  Effect.gen(function* () {
    const { setup } = yield* boot(() => Effect.void);

    yield* frameWith(setup, "Trust this folder?");
    setup.mockInput.pressEnter();
    yield* frameWith(setup, "Ask anything");

    expect(yield* (yield* ProjectTrust).trusted).toBe(true);
  }),
  testBaseServices,
);

effectTest(
  "ctrl+s stashes the draft and /pop brings it back",
  Effect.gen(function* () {
    const { setup } = yield* boot(() => Effect.void);

    yield* frameWith(setup, "Ask anything");
    yield* Effect.promise(() => setup.mockInput.typeText("park me"));
    setup.mockInput.pressKey("s", { ctrl: true });
    expect(yield* frameWith(setup, "Stashed")).toContain("Ask anything");

    yield* Effect.promise(() => setup.mockInput.typeText("/pop"));
    setup.mockInput.pressEnter();
    yield* frameWith(setup, "ctrl+d discard");
    setup.mockInput.pressEnter();

    expect(yield* frameWhere(setup, (frame) => !frame.includes("discard"))).toContain("park me");
  }),
  trustedServices,
);

effectTest(
  "an @ lists the workspace's files and enter tags the highlighted one",
  Effect.gen(function* () {
    const root = (yield* Directories).workspace;
    yield* Effect.promise(() => Bun.write(`${root}/notes.md`, "hi"));
    yield* Effect.promise(() => Bun.spawn(["git", "init", "-q"], { cwd: root }).exited);
    const { setup } = yield* boot(() => Effect.void);

    yield* frameWith(setup, "Ask anything");
    yield* Effect.promise(() => setup.mockInput.typeText("see @note"));
    yield* frameWith(setup, "📄 notes.md");
    setup.mockInput.pressEnter();

    expect(yield* frameWhere(setup, (frame) => !frame.includes("📄"))).toContain("see @notes.md");
  }),
  trustedServices,
);
