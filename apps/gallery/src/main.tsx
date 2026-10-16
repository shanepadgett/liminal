/**
 * Opens the Liminal gallery, where every token, primitive, component and screen is designed and
 * approved. `mise run gallery` runs it under `bun --hot`: on each save Bun re-runs this file in the
 * same process, so the old renderer is torn down, a new one is mounted, and the chosen group and
 * entry stay.
 */

import { type CliRenderer, createCliRenderer } from "@opentui/core";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/solid";
import { render } from "@opentui/solid";

import { GROUPS } from "./groups.tsx";
import type { Bookmark } from "./shell/navigation.ts";
import { Shell } from "./shell/Shell.tsx";

/** What outlives a hot reload. `--hot` keeps `globalThis` and re-runs every module. */
type HotState = { renderer?: CliRenderer; bookmark?: Bookmark };

declare global {
  var liminalGallery: HotState | undefined;
}

const hot: HotState = (globalThis.liminalGallery ??= {});

// The terminal stays claimed until the old renderer has fully closed.
if (hot.renderer !== undefined) {
  hot.renderer.destroy();
  await hot.renderer.closed;
}

const renderer = await createCliRenderer({ exitOnCtrlC: false });
hot.renderer = renderer;

// Destroying the renderer releases the key map too, so a hot reload starts with a fresh one.
const keymap = createDefaultOpenTuiKeymap(renderer);

const quit = () => {
  renderer.destroy();
  // `--hot` keeps the process alive after the renderer is gone.
  void renderer.closed.then(() => process.exit(0));
};

await render(
  () => (
    <KeymapProvider keymap={keymap}>
      <Shell
        groups={GROUPS}
        bookmark={hot.bookmark}
        onMove={(bookmark) => {
          hot.bookmark = bookmark;
        }}
        quit={quit}
      />
    </KeymapProvider>
  ),
  renderer,
);
