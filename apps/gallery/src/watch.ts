/**
 * Runs the gallery and restarts it whenever a source file changes. Bun's `--hot` does not watch
 * files that a plugin loads, and the Solid preload loads every `.tsx` file, so only a fresh process
 * is sure to run the code as saved.
 */

import { watch } from "node:fs";

const SOURCE = import.meta.dir;

/** Editors save in bursts (temp file, rename, write), and one restart should cover the burst. */
const SETTLE_MS = 100;

const watcher = watch(SOURCE, { recursive: true });

/** Resolves once files stop changing for `SETTLE_MS`. */
const nextChange = () =>
  new Promise<void>((resolve) => {
    let settle: Timer | undefined;

    const onChange = () => {
      clearTimeout(settle);

      settle = setTimeout(() => {
        watcher.off("change", onChange);
        resolve();
      }, SETTLE_MS);
    };

    watcher.on("change", onChange);
  });

const startGallery = () =>
  Bun.spawn(["bun", `${SOURCE}/main.tsx`], { stdio: ["inherit", "inherit", "inherit"] });

type Outcome = { readonly kind: "changed" } | { readonly kind: "exited"; readonly code: number };

/** Runs the gallery until the user quits, starting it again after every change. */
const runGallery = async (): Promise<void> => {
  const gallery = startGallery();

  const outcome = await Promise.race<Outcome>([
    nextChange().then(() => ({ kind: "changed" })),
    gallery.exited.then((code) => ({ kind: "exited", code })),
  ]);

  if (outcome.kind === "changed") {
    gallery.kill("SIGTERM");
    await gallery.exited;

    return runGallery();
  }

  // The user quit.
  if (outcome.code === 0) return;

  console.error(`The gallery exited with code ${outcome.code}. Save a file to start it again.`);
  await nextChange();

  return runGallery();
};

await runGallery();
watcher.close();
