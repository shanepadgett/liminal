/**
 * Shell safety: read-only lines pass, anything that can write, run code or leave the workspace does
 * not.
 */

import { describe, expect } from "bun:test";

import { Effect, Layer } from "effect";

import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";

import shellSafety from "../plugin.ts";
import { ShellSafety } from "../src/contract.ts";

const stack = serverOf(shellSafety).pipe(Layer.provideMerge(testBaseServices));

const safeLines = [
  "",
  "ls -la",
  "cat a.txt | grep foo | wc -l",
  "git status && git log --oneline -5",
  "git --no-pager diff HEAD~1",
  "git branch -a",
  "git branch --list 'feat/*'",
  "git tag",
  "git remote -v",
  "git remote get-url origin",
  "git reflog",
  "rg -n TODO src",
  "find . -name '*.ts' -type f",
  "sed -n 10,20p file.ts",
  "sed -n '$p' file.ts",
  "ls 2>/dev/null",
  "ls 2>&1 | head",
  'grep foo <<< "$text"',
  "cat <<'EOF'\nhello\nEOF",
  "echo $(git rev-parse HEAD)",
  'for f in a b; do cat "$f"; done',
  "if [[ -f a ]]; then cat a; elif [[ -f b ]]; then cat b; else ls; fi",
  "ls 2>&1 >/dev/null",
  "date +%Y-%m-%d",
  "sort -r names.txt",
  "uniq names.txt",
  "cd src && ls",
];

const unsafeLines = [
  "rm -rf build",
  "echo hi > out.txt",
  "echo hi >> out.txt",
  "cat a | tee b",
  "ls &",
  "FOO=1 ls",
  "echo $(rm x)",
  "cat <<EOF\n$(rm x)\nEOF",
  "diff <(ls a) <(ls b)",
  "echo $((1 + 2))",
  "find . -name x -delete",
  "find . -exec rm {} \\;",
  "find . -name $pattern",
  "find . -name *.ts",
  "fd -x rm",
  "rg --pre ./run.sh foo",
  "sort -o out.txt in.txt",
  "sort -ro out.txt in.txt",
  "sed -i s/a/b/ file",
  "sed 's/a/b/' file",
  "uniq in.txt out.txt",
  "xxd -r dump bin",
  "yq -i '.a = 1' x.yaml",
  "date -s 2020-01-01",
  "date 0101",
  "hostname evil",
  "git push",
  "git commit -m x",
  "git -C /tmp status",
  "git -c core.pager=sh log",
  "git diff --output=x",
  "git grep -O foo",
  "git branch new-branch",
  "git branch -D old",
  "git tag v1",
  "git remote add x url",
  "git reflog expire --all",
  "cd /tmp && git status",
  "$cmd status",
  "/bin/cat a",
  "f() { ls; }",
  "echo $(",
  "#!/bin/sh\nls",
  "ls >&3",
  "{ ls; } > out.txt",
  "if true; then ls; elif true; then rm x; fi",
  "ls <> file",
];

describe("isSafe", () => {
  for (const line of safeLines) {
    effectTest(
      `passes ${JSON.stringify(line)}`,
      Effect.gen(function* () {
        expect((yield* ShellSafety).isSafe(line, [])).toBe(true);
      }),
      stack,
    );
  }

  for (const line of unsafeLines) {
    effectTest(
      `stops ${JSON.stringify(line)}`,
      Effect.gen(function* () {
        expect((yield* ShellSafety).isSafe(line, [])).toBe(false);
      }),
      stack,
    );
  }
});

effectTest(
  "an extra prefix allows its command, word by word, but not unsafe shapes around it",
  Effect.gen(function* () {
    const safety = yield* ShellSafety;
    const extra = ["bun test", "  mise run lint  ", ""];

    expect(safety.isSafe("bun test packages/x", extra)).toBe(true);
    expect(safety.isSafe("mise run lint && git status", extra)).toBe(true);
    expect(safety.isSafe("bun testx", extra)).toBe(false);
    expect(safety.isSafe("bun install", extra)).toBe(false);
    expect(safety.isSafe("bun test > out.txt", extra)).toBe(false);
    expect(safety.isSafe("rm x", extra)).toBe(false);
  }),
  stack,
);

effectTest(
  "matchesAny finds a prefix anywhere in the line, even in shapes that are never safe",
  Effect.gen(function* () {
    const safety = yield* ShellSafety;
    const ask = ["git push", "npm publish"];

    expect(safety.matchesAny("git status && git push origin main", ask)).toBe(true);
    expect(safety.matchesAny("git push &", ask)).toBe(true);
    expect(safety.matchesAny("echo $(npm publish)", ask)).toBe(true);
    expect(safety.matchesAny("git pushx", ask)).toBe(false);
    expect(safety.matchesAny("git status", ask)).toBe(false);
    expect(safety.matchesAny("anything", [])).toBe(false);
  }),
  stack,
);
