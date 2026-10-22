/**
 * Opens the gallery, where Liminal's tokens, primitives, components and screens are designed. `mise
 * run gallery` restarts it on each save; the bookmark brings the user back to the same place.
 */

import { createCliRenderer } from "@opentui/core";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/solid";
import { render } from "@opentui/solid";

import { GROUPS } from "./entries.ts";
import { readBookmark, writeBookmark } from "./shell/bookmark.ts";
import { Shell } from "./shell/Shell.tsx";

const renderer = await createCliRenderer({ exitOnCtrlC: false });
const keymap = createDefaultOpenTuiKeymap(renderer);

const quit = () => {
  renderer.destroy();
  // The renderer restores the terminal but leaves the process running.
  void renderer.closed.then(() => process.exit(0));
};

// A restart on save stops the gallery with SIGTERM.
process.once("SIGTERM", quit);

await render(
  () => (
    <KeymapProvider keymap={keymap}>
      <Shell groups={GROUPS} bookmark={readBookmark()} save={writeBookmark} quit={quit} />
    </KeymapProvider>
  ),
  renderer,
);
