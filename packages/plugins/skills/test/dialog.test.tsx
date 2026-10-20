/** Deletion choices are explicit and start on Cancel, including at narrow terminal widths. */

import { expect, test } from "bun:test";

import { createTestRenderer } from "@opentui/core/testing";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/solid";
import { render } from "@opentui/solid";
import { createSignal } from "solid-js";

import { ColorContext, PALETTES, resolveRoles } from "@liminal/sdk/tui";

import {
  type DeleteSkillRequest,
  FolderLocation,
  ManagedSkill,
  MissingTargetLocation,
  SymlinkLocation,
} from "../src/contract.ts";
import { DeleteSkillDialog } from "../src/tui/DeleteSkillDialog.tsx";

const sample = (location: ManagedSkill["location"]) =>
  ManagedSkill.make({
    id: "selected",
    revision: "1",
    name: "review",
    path: "~/.agents/skills/review",
    description: "Review changes for bugs.",
    location,
  });

const draw = async (skill: ManagedSkill, width: number) => {
  const setup = await createTestRenderer({ width, height: 40 });
  const keymap = createDefaultOpenTuiKeymap(setup.renderer);
  const [isWorking, setWorking] = createSignal(false);
  const requests: DeleteSkillRequest["mode"][] = [];
  let closed = false;

  await render(
    () => (
      <KeymapProvider keymap={keymap}>
        <ColorContext.Provider value={resolveRoles(PALETTES[0])}>
          <DeleteSkillDialog
            skill={skill}
            isGlobal
            isWorking={isWorking()}
            close={() => {
              closed = true;
            }}
            remove={(mode) => {
              requests.push(mode);
              setWorking(true);
            }}
          />
        </ColorContext.Provider>
      </KeymapProvider>
    ),
    setup.renderer,
  );

  await setup.renderOnce();

  return { setup, requests, isClosed: () => closed };
};

for (const width of [48, 100]) {
  test(`folder confirmation defaults to Cancel at ${width} columns`, async () => {
    const { setup, requests, isClosed } = await draw(sample(FolderLocation.make({})), width);

    try {
      const frame = setup.captureCharFrame();
      expect(frame).toContain("Delete skill folder");
      expect(frame).toContain("cannot be undone.");
      setup.mockInput.pressEnter();
      await setup.renderOnce();
      expect(isClosed()).toBe(true);
      expect(requests).toEqual([]);
    } finally {
      setup.renderer.destroy();
    }
  });
}

test("valid links have both choices and block repeated requests and escape while deleting", async () => {
  const { setup, requests, isClosed } = await draw(
    sample(SymlinkLocation.make({ target: "~/source/review" })),
    100,
  );

  try {
    expect(setup.captureCharFrame()).toContain("Delete symlink only");
    expect(setup.captureCharFrame()).toContain("Delete symlink and target");
    expect(setup.captureCharFrame()).toContain("This is a global skill.");
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressArrow("down");
    await setup.renderOnce();
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    setup.mockInput.pressEnter();
    setup.mockInput.pressEscape();
    await setup.renderOnce();
    expect(requests).toEqual(["symlink-and-target"]);
    expect(isClosed()).toBe(false);
  } finally {
    setup.renderer.destroy();
  }
});

test("missing targets offer link deletion only", async () => {
  const { setup, requests } = await draw(
    sample(MissingTargetLocation.make({ target: "~/missing/review" })),
    100,
  );

  try {
    expect(setup.captureCharFrame()).toContain("Delete symlink only");
    expect(setup.captureCharFrame()).not.toContain("Delete symlink and target");
    setup.mockInput.pressArrow("down");
    await setup.renderOnce();
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(requests).toEqual(["symlink-only"]);
  } finally {
    setup.renderer.destroy();
  }
});
