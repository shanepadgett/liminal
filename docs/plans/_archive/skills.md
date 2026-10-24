# Plan: skills

Milestone 5's `skills` plugin: skill folders found where other agents put them, listed for the model, and tagged into a message with `$`. Work: [plugins/features.md](../plugins/features.md#skills-references-vocabulary).

## Today

- No skills. The archive's `skills` plugin found `<name>/SKILL.md` folders, listed them in the prompt, made each a `/name` command and an `@skill:name` tag, and sent the body with its path when used. Its scan took every entry that was a folder, without checking that `SKILL.md` was in it.
- `tags` adds the `@` draft trigger: a picked tag is a virtual extmark that Backspace removes whole, and its `loop/Send` wrap adds one hidden text part per tag, counted in `loop/added`.
- `instructions` walks from the repository root down to the workspace for `AGENTS.md` files (`foldersDown` in `agents-files.ts`).
- `approvals` takes extra read folders through `AllowedFolders`.

## Research

- The Agent Skills spec ([agentskills.io](https://agentskills.io/specification)) defines what a skill folder holds, not where it lives. Its client guide names `.agents/skills/` at project and user scope as the shared convention, beside the client's own folder.
- A skill is a folder holding a file named exactly `SKILL.md`; anything else in a skills folder is ignored.
- Same name twice: the nearer one wins, project over user. Pi also counts paths that resolve to the same file once.
- Codex reads `.agents/skills` in each folder from the repository root down to the working folder, and mentions a skill with `$`.
- When the user mentions a skill, the harness injects its body, frontmatter stripped, with its path, so relative paths resolve.

## How it works

1. **Find.** Each skills folder, nearest last: `~/.agents/skills`, `~/.liminal/skills`, then `.agents/skills` and `.liminal/skills` in each folder from the repository root down to the workspace. A skill is a direct child folder, symlinks followed, that holds `SKILL.md`; names starting with `.` are skipped. Front matter parses with `Bun.YAML`. A skill without a `description`, or whose front matter does not parse, is skipped with a logged warning. The nearest skill of a name wins; one file reached by two paths counts once.
2. **List.** A system prompt section lists each skill's name, description and `SKILL.md` path, with one line saying to read a skill's file when a task matches it. Skills with `disable-model-invocation: true` are left out of the list and still tag with `$`. No skills, no section.
3. **Tag.** In the composer, `$` where a word starts opens a skill picker. A picked `$name` is a highlighted mark that Backspace removes whole. A message can tag several skills anywhere in it.
4. **Send.** A `loop/Send` wrap adds, for each `$name` that names a skill, one hidden part after the user's text:

   ```text
   <skill name="x" path="…/x/SKILL.md">
   Loaded in full; don't read it again. Paths are relative to …/x.
   …body…
   </skill>
   ```

   A skill already in what the model sees, read through `History`, is not sent again.
5. **Read its files.** Every skills folder is an `AllowedFolders` read entry, so reading a skill's references or scripts never asks.

## Round 1 decisions

- Locations are `.agents/skills` and `.liminal/skills` at user and project scope only; no `.claude/skills`.
- `$` only; skills are not slash commands.
- A checkpoint does not bring tagged skills back. The user tags them again, or the model reads them again from the list.
- Skills move behind `tools-search` once it exists, so a long skill list does not fill the system prompt; recorded in [plugins/features.md](../plugins/features.md#tools-search).

## Code plan (round 2)

```text
 composer ──$──▶ skills tui ──skills/list──▶ skills ──Section──▶ system-prompt
                                               │
 loop/Send ◀───────── wrap: add <skill> parts ─┤── read context ──▶ History
                                               │
 approvals ◀──── AllowedFolders (read) ────────┘── find ──▶ FileSystem, Directories
```

New plugin `packages/plugins/skills` (Add, Wrap, Attach):

```ts
// contract.ts
export const SkillSummary = Schema.Struct({ name: Schema.String, description: Schema.String });
export class SkillsRpc extends RpcGroup.make(
  Rpc.make("skills/list", { success: Schema.Array(SkillSummary) }),
) {}
export const skillsIn: (text: string) => ReadonlyArray<string>; // `$name` where a word starts

// find.ts
interface Skill { name; description; path; folder; listed: boolean }
const skillsFolders: (directories, path) => ReadonlyArray<string>; // farthest first
const findSkills: Effect<{ skills: ReadonlyArray<Skill>; problems: ReadonlyArray<string> }>;
//   per folder: readDirectory → skip ".x" → stat <entry>/SKILL.md is a file → realPath once
//   → Bun.YAML front matter → nearest name wins

// index.ts
Sections.add({ name: "skills", text: listText })          // after instructions
Send.wrap((request, next) => withSkills(request.input) → next)
//   skillsIn(text) → known names → drop ones whose <skill name="x" is in History.run(log)
//   → read SKILL.md now → append parts, add their count to loop/added
AllowedFolders.add({ path: folder, write: false }) for each skills folder
SkillsRpc.toLayer({ "skills/list": findSkills → summaries })

// tui/index.tsx
DraftTriggers.add({ char: "$", where: "any-word", open })  // rows ranked by fuzzysort
```

Shared pieces:

- `foldersDown` (repository root down to the workspace) moves from `instructions` into the `directories` contract, used by both.
- `writeTag`'s mark (`tags/src/tui/marks.ts`) moves into `chat`'s `tui` exports as `writeMark(draft, token, text, style)`, used by `@` and `$`.

## Round 2 decisions

- Skill parts go after the user's text, as tag parts do, because `loop/added` counts a message's last parts.
- `foldersDown` moves into the `directories` contract.
- `writeMark` moves into `chat`'s `tui` exports.

## Round 3: marks after send

Today a mark (`$skill`, `@file`) is only a draft extmark. Sending keeps plain text, so the transcript and a draft refilled from the queue show no highlight.

```text
 composer ──send──▶ ChatSend input + chat/marks ──▶ session log
                                                        │
 transcript Prompt ◀── marks of the input ──────────────┤
                                                        │
 draft (esc, alt+up) ◀── loop/cancel, loop/pull-back ───┘
```

- The attribute `chat/marks` holds the marked texts in draft order, such as `["$review", "@src/a.ts"]`, read from the draft's extmarks at send. Texts, not offsets, so trimming and joining drafts cannot shift them.
- The transcript's `Prompt` highlights each mark at its next match after the previous one, across wrapped lines.
- Taking inputs back (esc, alt+up) puts each input's text into the draft and makes its marks again, each found the same way. `Draft.prepend(text)` and `Draft.insert(text)` take the marks too.
- Stashes keep marks: a `marks` column in `stashes`, and `/pop` makes them again.
- Agreed with the user, including the edge case: a hand-typed copy before a picked mark takes the highlight.
- Built: `chat/marks` (`Marks`, `markRanges`, `writtenOf` in `chat/view`), `Draft.marks()`, `insert(text, marks?)`, `prepend(text, marks?)`, and migration `0002_add_marks` in stash. An empty send sets no attribute. Live check pending.
