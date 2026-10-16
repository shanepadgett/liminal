/**
 * Opens the Liminal gallery, where every token, primitive, component and screen is designed and
 * approved. `mise run gallery` runs it under `watch.ts`, which restarts it on each save; the saved
 * bookmark brings the user back to the same group and entry.
 */

import { createCliRenderer } from "@opentui/core";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/solid";
import { render } from "@opentui/solid";

import { GROUPS } from "./groups.tsx";
import { readBookmark, writeBookmark } from "./shell/bookmark.ts";
import { Shell } from "./shell/Shell.tsx";
import { PALETTES } from "./tokens/palettes.ts";

const renderer = await createCliRenderer({ exitOnCtrlC: false });
const keymap = createDefaultOpenTuiKeymap(renderer);

const quit = () => {
  renderer.destroy();
  // The renderer's own signal handler restores the terminal but leaves the process running.
  void renderer.closed.then(() => process.exit(0));
};

// The watcher stops the gallery with SIGTERM before each restart.
process.once("SIGTERM", quit);

await render(
  () => (
    <KeymapProvider keymap={keymap}>
      <Shell
        groups={GROUPS}
        palettes={PALETTES}
        bookmark={readBookmark()}
        onMove={writeBookmark}
        quit={quit}
      />
    </KeymapProvider>
  ),
  renderer,
);
