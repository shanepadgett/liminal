/** Copies version-matched dependency docs into `docs/reference/copies/` and rebuilds the index. */
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";

import { fetchDocs, relativePath } from "./fetch.ts";
import { buildIndex, type Records } from "./index-page.ts";
import { COPIES, fingerprint, loadManifest, REFERENCE, type Source } from "./manifest.ts";
import { packageFolder, pinnedVersion, readPins, type Pins } from "./pins.ts";

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u;

const copySource = async (
  cwd: string,
  pins: Pins,
  source: Source,
  staging: string,
): Promise<Records[string]> => {
  relativePath(source.package);
  const version = pinnedVersion(source, pins);

  if (version === undefined || !EXACT_VERSION.test(version))
    throw new Error(`Missing exact version for ${source.package}`);

  const destination = join(staging, source.package, version);
  await mkdir(destination, { recursive: true });

  const installed =
    source.versionSource === "lock" ? packageFolder(cwd, pins, source.package) : undefined;

  const target = { name: source.package, version, destination, installed };
  const fetched = await Promise.all(source.docs.map((set) => fetchDocs(target, set)));
  const commits = fetched.filter((commit) => commit !== undefined);

  return { version, fingerprint: fingerprint(source), commits };
};

const syncReferenceDocs = async (cwd: string): Promise<void> => {
  const manifest = await loadManifest(cwd);
  const pins = await readPins(cwd);
  const reference = join(cwd, REFERENCE);
  await mkdir(reference, { recursive: true });
  const staging = await mkdtemp(join(reference, ".stage-"));

  try {
    const copied = await Promise.all(
      manifest.sources.map(
        async (source) => [source.package, await copySource(cwd, pins, source, staging)] as const,
      ),
    );

    const records: Records = Object.fromEntries(copied);
    const generated = await buildIndex({ cwd, copies: staging, manifest, pins, records });

    await Promise.all(
      [...generated].map(async ([path, content]) => {
        await mkdir(dirname(join(staging, path)), { recursive: true });
        await Bun.write(join(staging, path), content);
      }),
    );

    await Bun.write(join(staging, "versions.json"), `${JSON.stringify(records, null, 2)}\n`);
    await rm(join(cwd, COPIES), { recursive: true, force: true });
    await rename(staging, join(cwd, COPIES));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
};

await syncReferenceDocs(process.cwd());
