/**
 * Fails when a dependency has no reference docs, or its copied docs do not match its pinned
 * version.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

import { buildIndex, decodeRecords, type Records } from "./index-page.ts";
import {
  COPIES,
  fingerprint,
  loadManifest,
  MANIFEST,
  type Manifest,
  type Source,
} from "./manifest.ts";
import { apiPath, pinnedNames, pinnedVersion, readPins, type Pins } from "./pins.ts";

const SYNC = "run `mise run docs`";

const coverageProblems = (manifest: Manifest, pins: Pins): string[] => {
  const names = pinnedNames(pins);
  const covered = new Set(manifest.sources.map((source) => source.package));

  const uncovered = names.flatMap((name) =>
    covered.has(name) || manifest.ignore.includes(name)
      ? []
      : [`No reference for ${name}: add a source to ${MANIFEST}, or list it in ignore`],
  );

  const staleIgnores = manifest.ignore.flatMap((name) =>
    names.includes(name) ? [] : [`${MANIFEST} ignores ${name}, which is not a dependency or tool`],
  );

  const unpinned = manifest.sources.flatMap((source) =>
    pinnedVersion(source, pins) === undefined
      ? [`${MANIFEST} has a source for ${source.package}, which is not pinned`]
      : [],
  );

  return [...uncovered, ...staleIgnores, ...unpinned];
};

const apiProblems = (cwd: string, pins: Pins, source: Source): string[] =>
  source.api.flatMap((pointer) => {
    const path = apiPath(cwd, pins, source, pointer);

    return existsSync(path) ? [] : [`${source.package}: API path ${path} does not exist`];
  });

const sourceProblems = (cwd: string, pins: Pins, source: Source, records: Records): string[] => {
  const name = source.package;
  const version = pinnedVersion(source, pins);
  const record = records[name];
  if (version === undefined) return [];
  if (record === undefined) return [`No copy of the docs for ${name}; ${SYNC}`];

  if (record.version !== version)
    return [`The docs for ${name} are ${record.version} but ${version} is pinned; ${SYNC}`];

  const stale =
    record.fingerprint === fingerprint(source)
      ? []
      : [`The source for ${name} changed after its docs were copied; ${SYNC}`];

  const missing = existsSync(join(cwd, COPIES, name, version))
    ? []
    : [`The docs folder for ${name} ${version} is missing; ${SYNC}`];

  return [...stale, ...missing, ...apiProblems(cwd, pins, source)];
};

const indexProblems = async (
  cwd: string,
  manifest: Manifest,
  pins: Pins,
  records: Records,
): Promise<string[]> => {
  const copies = join(cwd, COPIES);
  const generated = await buildIndex({ cwd, copies, manifest, pins, records });

  const problems = await Promise.all(
    [...generated].map(async ([path, content]) => {
      const file = Bun.file(join(copies, path));
      const current = (await file.exists()) && (await file.text()) === content;

      return current ? [] : [`${COPIES}/${path} is out of date; ${SYNC}`];
    }),
  );

  return problems.flat();
};

const findProblems = async (cwd: string): Promise<string[]> => {
  const manifest = await loadManifest(cwd);
  const pins = await readPins(cwd);
  const recordsFile = Bun.file(join(cwd, COPIES, "versions.json"));
  const coverage = coverageProblems(manifest, pins);

  if (!(await recordsFile.exists())) return [...coverage, `${COPIES} is missing; ${SYNC}`];

  const records = decodeRecords(await recordsFile.json());

  const unknown = Object.keys(records).flatMap((name) =>
    manifest.sources.some((source) => source.package === name)
      ? []
      : [`${COPIES} has docs for ${name}, which is not in ${MANIFEST}; ${SYNC}`],
  );

  const problems = [
    ...coverage,
    ...manifest.sources.flatMap((source) => sourceProblems(cwd, pins, source, records)),
    ...unknown,
  ];

  if (problems.length > 0) return problems;

  return indexProblems(cwd, manifest, pins, records);
};

const problems = await findProblems(process.cwd());
for (const problem of problems) console.log(problem);
process.exitCode = problems.length === 0 ? 0 : 1;
