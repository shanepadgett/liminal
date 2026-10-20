/** The real dialog and RPCs preserve the filter and selection across confirmation and deletion. */

import { expect } from "bun:test";

import { createTestRenderer } from "@opentui/core/testing";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/solid";
import { render } from "@opentui/solid";
import { Effect } from "effect";
import { TestClock } from "effect/testing";

import { effectTest } from "@liminal/sdk/testing";
import {
  ColorContext,
  DialogLayer,
  makeBridge,
  makeTuiDialogs,
  PALETTES,
  resolveRoles,
} from "@liminal/sdk/tui";

import { showSkillsDialog } from "../src/tui/SkillsDialog.tsx";
import { fixture } from "./fixtures.ts";
import { stack } from "./stack.ts";

const mount = Effect.gen(function* () {
  const data = yield* fixture;

  const setup = yield* Effect.acquireRelease(
    Effect.promise(() => createTestRenderer({ width: 100, height: 40 })),
    (made) =>
      Effect.sync(() => {
        made.renderer.destroy();
      }),
  );

  const keymap = createDefaultOpenTuiKeymap(setup.renderer);
  const dialogs = makeTuiDialogs();
  const bridge = yield* makeBridge;

  yield* Effect.promise(() =>
    render(
      () => (
        <KeymapProvider keymap={keymap}>
          <ColorContext.Provider value={resolveRoles(PALETTES[0])}>
            <DialogLayer dialogs={dialogs} />
          </ColorContext.Provider>
        </KeymapProvider>
      ),
      setup.renderer,
    ),
  );

  showSkillsDialog({ client: data.client, bridge, dialogs, refreshCommands: Effect.void });

  return { ...data, setup };
});

const frameWith = Effect.fn("test.skillsFrame")(function* (
  setup: Effect.Success<typeof mount>["setup"],
  text: string,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    yield* Effect.promise(() => setup.renderOnce());
    const frame = setup.captureCharFrame();
    if (frame.includes(text)) return frame;
    yield* Effect.sleep("10 millis");
  }

  return yield* Effect.die(`Could not find ${text} in skills dialog`);
});

effectTest(
  "canceling and completing link deletion retain the filter and update the physical inventory",
  Effect.gen(function* () {
    const { setup, fs, target, link } = yield* mount;
    yield* frameWith(setup, "Linked description");
    yield* Effect.promise(() => setup.mockInput.typeText("linked"));
    setup.mockInput.pressKey("x", { ctrl: true });
    yield* frameWith(setup, "Delete symlink?");
    setup.mockInput.pressEnter();
    const canceled = yield* frameWith(setup, "Linked description");
    expect(canceled).toContain("› linked");

    expect(canceled.split("\n").find((line) => line.includes("Linked description"))).toMatch(
      /linked\s+Linked description\s+Symlink/,
    );

    expect(canceled.match(/Linked description/g)).toHaveLength(1);
    setup.mockInput.pressKey("x", { ctrl: true });
    yield* frameWith(setup, "Delete symlink?");
    setup.mockInput.pressArrow("down");
    yield* Effect.promise(() => setup.renderOnce());
    setup.mockInput.pressEnter();
    const finished = yield* frameWith(setup, "No matching options");
    expect(finished).toContain("› linked");
    expect(finished).not.toContain("Linked description");
    expect(yield* fs.exists(target)).toBe(true);
    expect(yield* fs.readLink(link).pipe(Effect.flip)).toBeDefined();
  }).pipe(Effect.scoped, TestClock.withLive),
  stack,
);

effectTest(
  "a changed selection shows an error, refreshes the link and allows a new confirmation",
  Effect.gen(function* () {
    const { setup, fs, target, link } = yield* mount;
    yield* frameWith(setup, "Linked description");
    setup.mockInput.pressKey("x", { ctrl: true });
    yield* frameWith(setup, "Delete symlink?");
    yield* fs.remove(target, { recursive: true });
    setup.mockInput.pressArrow("down");
    yield* Effect.promise(() => setup.renderOnce());
    setup.mockInput.pressEnter();
    const failed = yield* frameWith(setup, "target missing");
    expect(failed).toContain("changed");
    setup.mockInput.pressKey("x", { ctrl: true });
    yield* frameWith(setup, "Delete symlink?");
    setup.mockInput.pressArrow("down");
    yield* Effect.promise(() => setup.renderOnce());
    setup.mockInput.pressEnter();
    const refreshed = yield* frameWith(setup, "No options in this section.");
    expect(refreshed).not.toContain("changed");
    expect(yield* fs.readLink(link).pipe(Effect.flip)).toBeDefined();
  }).pipe(Effect.scoped, TestClock.withLive),
  stack,
);

effectTest(
  "deleting a middle entry keeps the filter and highlights the next matching skill",
  Effect.gen(function* () {
    const { setup, fs, path, root } = yield* mount;
    yield* frameWith(setup, "Linked description");

    for (const name of ["review-a", "review-b", "review-c"]) {
      const folder = path.join(root, name);

      yield* fs.makeDirectory(folder);

      yield* fs.writeFileString(
        path.join(folder, "SKILL.md"),
        `---\ndescription: Description for ${name}\n---\n`,
      );
    }

    setup.mockInput.pressKey("r", { ctrl: true });
    yield* Effect.promise(() => setup.mockInput.typeText("review"));
    yield* frameWith(setup, "Description for review-a");
    setup.mockInput.pressArrow("down");
    yield* frameWith(setup, "Description for review-b");
    setup.mockInput.pressKey("x", { ctrl: true });
    yield* frameWith(setup, "Delete skill?");
    setup.mockInput.pressArrow("down");
    yield* Effect.promise(() => setup.renderOnce());
    setup.mockInput.pressEnter();
    const frame = yield* frameWith(setup, "Description for review-c");
    expect(frame).toContain("› review");
    expect(yield* fs.exists(path.join(root, "review-b"))).toBe(false);
  }).pipe(Effect.scoped, TestClock.withLive),
  stack,
);
