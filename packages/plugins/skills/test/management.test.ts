/** Management RPCs operate only on isolated physical skill entries, not name winners. */

import { expect } from "bun:test";

import { Data, Effect, FileSystem, Predicate, Option, Layer, PlatformError, Ref } from "effect";

import { ProjectTrust } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { type DeleteSkillRequest, SymlinkLocation } from "../src/contract.ts";
import { fixture, linked } from "./fixtures.ts";
import { managementStack, stack } from "./stack.ts";

effectTest(
  "inventory retains broken links, malformed folders and every existing source root",
  Effect.gen(function* () {
    const { fs, path, directories, root, target, client } = yield* fixture;
    yield* fs.symlink(path.join(directories.temp, "absent"), path.join(root, "broken"));
    yield* fs.makeDirectory(path.join(root, "malformed"));
    yield* fs.writeFileString(path.join(root, ".DS_Store"), "ignored");
    const untrusted = yield* client["skills/inventory"]();

    expect(untrusted.map((folder) => folder.path)).toEqual([
      root,
      path.join(directories.global, "skills"),
    ]);

    const entries = untrusted.flatMap((folder) => folder.entries);
    expect(entries.map((entry) => entry.name)).toEqual(["broken", "linked", "malformed"]);

    expect(
      entries.some(
        (entry) => entry.name === "broken" && Predicate.isTagged(entry.location, "MissingTarget"),
      ),
    ).toBe(true);

    expect(entries.find((entry) => entry.name === "linked")?.location).toEqual(
      SymlinkLocation.make({ target: yield* fs.realPath(target) }),
    );

    yield* (yield* ProjectTrust).trust;
    const trusted = yield* client["skills/inventory"]();

    expect(trusted.map((folder) => folder.path)).toContain(
      path.join(directories.workspace, ".agents", "skills"),
    );

    expect(trusted.map((folder) => folder.path)).toContain(
      path.join(directories.project, "skills"),
    );

    expect(trusted.some((folder) => folder.entries.length === 0 && folder.problem === null)).toBe(
      true,
    );
  }),
  stack,
);

for (const mode of ["symlink-only", "symlink-and-target"] satisfies ReadonlyArray<
  DeleteSkillRequest["mode"]
>) {
  effectTest(
    `${mode} removes exactly the confirmed paths`,
    Effect.gen(function* () {
      const { fs, target, link, client } = yield* fixture;
      const entry = yield* linked(client);
      yield* client["skills/delete"]({ id: entry.id, revision: entry.revision, mode });
      expect(yield* fs.readLink(link).pipe(Effect.flip)).toBeDefined();
      expect(yield* fs.exists(target)).toBe(mode === "symlink-only");

      expect(
        (yield* client["skills/inventory"]()).flatMap((folder) => folder.entries),
      ).toHaveLength(0);
    }),
    stack,
  );
}

effectTest(
  "a dangling symlink can be removed without touching any target",
  Effect.gen(function* () {
    const { fs, target, link, client } = yield* fixture;
    yield* fs.remove(target, { recursive: true });
    const entry = yield* linked(client);
    expect(Predicate.isTagged(entry.location, "MissingTarget")).toBe(true);

    yield* client["skills/delete"]({
      id: entry.id,
      revision: entry.revision,
      mode: "symlink-only",
    });

    expect(yield* fs.readLink(link).pipe(Effect.flip)).toBeDefined();
  }),
  stack,
);

effectTest(
  "deleting a nearer folder exposes the farther skill without merging inventory entries",
  Effect.gen(function* () {
    const { fs, path, directories, client } = yield* fixture;
    yield* (yield* ProjectTrust).trust;
    const near = path.join(directories.project, "skills", "linked");
    yield* fs.makeDirectory(near, { recursive: true });

    yield* fs.writeFileString(
      path.join(near, "SKILL.md"),
      "---\ndescription: Nearer description\n---\nNear.",
    );

    const folders = yield* client["skills/inventory"]();

    const copies = folders
      .flatMap((folder) => folder.entries)
      .filter((entry) => entry.name === "linked");

    expect(copies).toHaveLength(2);
    expect((yield* client["skills/list"]())[0]?.description).toBe("Nearer description");

    const entry = yield* Effect.fromOption(
      Option.fromUndefinedOr(copies.find((skill) => skill.path === near)),
    ).pipe(Effect.orDie);

    yield* client["skills/delete"]({ id: entry.id, revision: entry.revision, mode: "folder" });
    expect(yield* fs.exists(near)).toBe(false);
    expect((yield* client["skills/list"]())[0]?.description).toBe("Linked description");
  }),
  stack,
);

effectTest(
  "forged and expired revisions never delete anything",
  Effect.gen(function* () {
    const { fs, target, client } = yield* fixture;
    const entry = yield* linked(client);

    const forged = yield* client["skills/delete"]({
      id: target,
      revision: entry.revision,
      mode: "folder",
    }).pipe(Effect.flip);

    expect(forged.reason).toBe("changed");
    yield* client["skills/inventory"]();

    const expired = yield* client["skills/delete"]({
      id: entry.id,
      revision: entry.revision,
      mode: "symlink-and-target",
    }).pipe(Effect.flip);

    expect(expired.reason).toBe("changed");
    expect(yield* fs.exists(target)).toBe(true);
  }),
  stack,
);

effectTest(
  "retargeting a link after confirmation refuses deletion",
  Effect.gen(function* () {
    const { fs, path, directories, link, target, client } = yield* fixture;
    const entry = yield* linked(client);
    const replacement = path.join(directories.temp, "replacement");
    yield* fs.makeDirectory(replacement);
    yield* fs.remove(link);
    yield* fs.symlink(replacement, link);

    const error = yield* client["skills/delete"]({
      id: entry.id,
      revision: entry.revision,
      mode: "symlink-and-target",
    }).pipe(Effect.flip);

    expect(error.reason).toBe("changed");
    expect(yield* fs.exists(target)).toBe(true);
    expect(yield* fs.exists(replacement)).toBe(true);
  }),
  stack,
);

effectTest(
  "protected roots cannot be deleted through a skill symlink",
  Effect.gen(function* () {
    const { fs, path, directories, link, client } = yield* fixture;
    yield* fs.remove(link);

    yield* fs.writeFileString(
      path.join(directories.home, "SKILL.md"),
      "---\ndescription: Not a skill target\n---\n",
    );

    yield* fs.symlink(directories.home, link);
    const entry = yield* linked(client);

    const error = yield* client["skills/delete"]({
      id: entry.id,
      revision: entry.revision,
      mode: "symlink-and-target",
    }).pipe(Effect.flip);

    expect(error.reason).toBe("forbidden");
    expect(yield* fs.readLink(link)).toBe(directories.home);
  }),
  stack,
);

const PermissionDenied = Data.TaggedClass("PermissionDenied");

const denied = (path: string) =>
  PlatformError.systemError(
    new PermissionDenied({ module: "FileSystem", method: "remove", pathOrDescriptor: path }),
  );

const failingFileSystem = (failure: "target" | "link" | "inventory") =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      return FileSystem.FileSystem.of({
        ...fs,
        readDirectory: (path, options) =>
          failure === "inventory" && path.endsWith(".agents/skills")
            ? Effect.fail(denied(path))
            : fs.readDirectory(path, options),
        remove: (path, options) => {
          const shouldFail =
            (failure === "target" && path.endsWith("/source"))
            || (failure === "link" && path.endsWith("/linked"));

          return shouldFail ? Effect.fail(denied(path)) : fs.remove(path, options);
        },
      });
    }),
  ).pipe(Layer.provideMerge(testBaseServices));

for (const failure of ["target", "link"] satisfies ReadonlyArray<"target" | "link">) {
  effectTest(
    `${failure} deletion failure reports the actual completion state`,
    Effect.gen(function* () {
      const { fs, target, link, client } = yield* fixture;
      const entry = yield* linked(client);

      const error = yield* client["skills/delete"]({
        id: entry.id,
        revision: entry.revision,
        mode: "symlink-and-target",
      }).pipe(Effect.flip);

      expect(error.reason).toBe(failure === "link" ? "partial" : "io");
      expect(yield* fs.exists(target)).toBe(failure === "target");
      expect(yield* fs.readLink(link)).toBeDefined();
      const refreshed = yield* linked(client);
      expect(Predicate.isTagged(refreshed.location, "MissingTarget")).toBe(failure === "link");
    }),
    managementStack(failingFileSystem(failure)),
  );
}

effectTest(
  "unreadable skill roots show a problem rather than an empty successful scan",
  Effect.gen(function* () {
    const { root, client } = yield* fixture;
    const folders = yield* client["skills/inventory"]();
    expect(folders.find((folder) => folder.path === root)?.problem).toContain("PermissionDenied");
  }),
  managementStack(failingFileSystem("inventory")),
);

const revocableTrust = Layer.effect(
  ProjectTrust,
  Effect.gen(function* () {
    const trusted = yield* Ref.make(true);

    return ProjectTrust.of({ trusted: Ref.getAndSet(trusted, false), trust: Effect.void });
  }),
).pipe(Layer.provideMerge(testBaseServices));

effectTest(
  "losing workspace trust invalidates a project deletion",
  Effect.gen(function* () {
    const { fs, path, directories, client } = yield* fixture;
    const folder = path.join(directories.project, "skills", "local");
    yield* fs.makeDirectory(folder, { recursive: true });

    yield* fs.writeFileString(
      path.join(folder, "SKILL.md"),
      "---\ndescription: Local skill\n---\n",
    );

    const folders = yield* client["skills/inventory"]();

    const selected = yield* Effect.fromOption(
      Option.fromUndefinedOr(
        folders.flatMap((root) => root.entries).find((entry) => entry.path === folder),
      ),
    ).pipe(Effect.orDie);

    const error = yield* client["skills/delete"]({
      id: selected.id,
      revision: selected.revision,
      mode: "folder",
    }).pipe(Effect.flip);

    expect(error.reason).toBe("changed");
    expect(yield* fs.exists(folder)).toBe(true);
  }),
  managementStack(revocableTrust),
);
