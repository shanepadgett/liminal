# Plan: milestone 5, commands and `/commit`

Slash commands that run only while no turn runs, then `/commit` on top of them.

## Today

| Piece | Today |
| --- | --- |
| UI commands | Keymap commands in `packages/tui/src/commands.ts`, such as `/connect`, `/model`, `/theme` and `/sessions`. They run at once, even while a turn runs. The `/` menu and the palette list them. |
| `/qna` | The `questions` plugin catches `/qna text` in the draft with its own `ChatSend` wrap and sends a `questions/requested` input as a follow-up. It waits for the running turn, then starts a turn. Nothing above the composer shows it waiting: the queued lines show only inputs with draft text. |
| Notifications | None in the product. The gallery has a design: Components, Chat, Notifications. |
| Structured calls | `Models.generateObject` with the `small` model; it works on providers with and without native structured output. |
| Previous code | `archive/packages/plugins/commit/`: RPCs for each step, a capped evidence prompt, a plan checked and retried, a TUI flow with a review and a push question. |

## Agreed

| Kind | Examples | When it runs | What it does |
| --- | --- | --- | --- |
| UI command | `/connect`, `/model`, `/theme`, `/sessions` | At once, even while a turn runs | Opens a dialog or changes a setting. Stays a keymap command. |
| Prompt command | `/qna`, later skills | Only while no turn runs | Starts a model turn from a hidden request; no user prompt row. |
| Action command | `/commit` | Only while no turn runs | Does one-off work outside the session's turns, then asks the user to confirm. Starts no turn. |

- Prompt and action commands are never queued. Run while a turn runs, they do nothing but show a warning notification above the composer, which leaves after about 5 seconds: `/commit runs once the turn ends`, `Send it again when the turn is done.` The draft keeps the command.
- The `/` menu and the palette list them beside UI commands, during a turn too.
- `/qna` moves onto the shared structure; its own `ChatSend` wrap goes.
- Notifications come into the product from the gallery design: a band per notification above the composer, a mark in the gutter column, and a track on the right that empties until it leaves. `/commit`'s endings use them too.

### `/commit`

- One `Models.generateObject` call with the `small` model plans the commits. Its evidence is the archive's, capped: changed files with status, diffs (48K in all, 400 to 4,000 per file), the last 12 commit subjects, and the text after `/commit` as an instruction. It reads no session history; the changes alone decide the commits.
- The plan comes back as JSON: commits, each a conventional subject and its files. `commit` checks that every changed file appears exactly once and every subject is conventional; a failing plan goes back to the model with the problem, up to 3 tries.
- All changed files in the repository holding the workspace are planned. Text after `/commit` narrows or steers the plan.
- The user reviews the plan: enter commits, esc cancels. Then git makes each commit in order.
- A `commit.push` setting: `ask`, `always` or `never`, `ask` by default. The question offers No first.
- Each ending is one notification. No session event records it.
- No checks step until the `checks` plugin exists.

### Design

In the gallery: Components, Asks, Commit, and Components, Chat, Notifications, "Command during a turn".

| Step | Shows | Keys |
| --- | --- | --- |
| Planning | Title `Commit`, the file count at the right, a spinner `planning commits with <model>` | esc stop |
| Review | Title `Commit these changes?`, `3 commits · 9 files` at the right. Each commit's number and subject, its first 3 files under it with a colored status letter, `+2 more` for the rest. 4 commits in view, with `↑ 1 more commit` and `↓ 1 more commit` lines. | ↑↓ scroll (only when more than 4), enter commit, esc cancel |
| Committing | Each subject with a mark: `✓` and its hash when made, `◌` in accent for the current one, `·` faint for the rest. `committing 2 of 3` at the right. | none |
| Push | Title `Push 3 commits to origin/main?`, choices `No, keep them local` and `Yes, push` | ↑↓ choose, enter answer, esc no |
| Pushing | Title `Push`, a spinner `pushing 3 commits to origin/main` | none |

- No `Commands` registry in `loop`: with nothing queued it has no job. A TUI command takes the text typed after its name and can be marked to run only while no turn runs. `chat`, which knows whether a turn runs, shows the warning.
- Notifications live in `packages/tui`, so any plugin can post one.

## Steps

| Step | Work |
| --- | --- |
| 1 | Notifications in `packages/tui` |
| 2 | Commands that take text and can be blocked; `slash` runs typed commands; `/qna` moves over |
| 3 | The `commit` plugin |

## Step 1: notifications

```ts
// packages/tui/src/notifications.ts
type NotificationKind = "info" | "success" | "warning" | "error";
interface Notification { readonly kind: NotificationKind; readonly title: string; readonly message?: string }

class Notifications extends Context.Service<Notifications, {
  readonly post: (notification: Notification) => void;
  /** On screen now, oldest first, each with the share of its 5 seconds left. */
  readonly shown: Accessor<ReadonlyArray<Notification & { id: string; remaining: number }>>;
}>()("tui/Notifications") {}
```

- Provided with the other base services in `packages/tui`. `kit/Notifications.tsx` is the gallery's component, copied.
- `chat`'s composer draws `shown` above the queued lines.

## Step 2: commands

```ts
// packages/tui/src/commands.ts
interface Blocked { readonly title: string; readonly message?: string }

interface Command {
  // ...as today
  /** The text it takes after its slash name: `optional`, or `required` and blocked without it. */
  readonly argument?: { readonly kind: "optional" | "required"; readonly hint: string };
  /** While it gives a reason, the command shows but does not run; running it posts the reason. */
  readonly blocked?: Accessor<Blocked | undefined>;
  /** `text` is what followed the slash name in the draft; empty from a key or the palette. */
  readonly run: (text: string) => void;
}
```

- `keymapCommand` reads the keymap's `payload` as the text. Blocked, it posts a warning through `Notifications` and does not run.
- `chat` adds `ChatScreen.running`, whether a turn runs in the shown session, and exports `turnBlocked(chat, name)`, the `blocked` of a command that runs only while no turn runs: `/name runs once the turn ends`, `Send it again when the turn is done.`
- `slash` adds a `ChatSend` wrap: a draft that starts with a reachable command's `/name` runs it with the rest as `payload` instead of sending. A blocked command's `/name` and any text after it go back into the draft with `ChatScreen.draft.insert`, so the `/` menu stays closed. The menu's enter completes the name and sends the draft through the same path. Tab completes the name with a space after it when the command takes text. Rows show the text dimmed after the name: `[hint]` optional, `<hint>` required.
- A required command run with no text is blocked: `/name needs text`. `/commit` (`guidance`) and `/qna` (`topic`) take optional text.
- Notifications show above the `/` menu.
- `questions` drops its `/qna` pattern and `ChatSend` wrap. `/qna` is a command with `blocked: turnBlocked(chat, "qna")` whose `run(text)` calls `questions/qna`.

## Step 3: `commit`

`packages/plugins/commit/`, from the archive without the checks step.

```ts
// contract.ts
const ChangedFile = Schema.Struct({ status: FileStatus, path: Schema.String, previousPath: Schema.optional(Schema.String) });
const PlannedCommit = Schema.Struct({ message: Schema.String, files: Schema.Array(ChangedFile) });
const CommitStart = Schema.Struct({ root: Schema.String, files: Schema.Array(ChangedFile), push: PushSetting, planner: Schema.String });
const PushTarget = Schema.Struct({ remote: Schema.String, branch: Schema.String, name: Schema.String });
const CommitProgress = Schema.Union([Committing /* { index } */, Committed /* { hashes } */]);
class CommitError extends Schema.TaggedError /* { message } */ {}
class CommitFailed extends Schema.TaggedError /* { hashes, message } */ {}

class CommitRpc extends RpcGroup.make(
  Rpc.make("commit/start", { success: CommitStart, error: CommitError }),
  Rpc.make("commit/plan", { payload: { start: CommitStart, instruction: Schema.String }, success: Schema.Array(PlannedCommit), error: CommitError }),
  Rpc.make("commit/apply", { payload: { root, commits }, success: CommitProgress, error: CommitFailed, stream: true }),
  Rpc.make("commit/push-target", { payload: { root }, success: Schema.NullOr(PushTarget), error: CommitError }),
  Rpc.make("commit/push", { payload: { root, target: PushTarget }, error: CommitError }),
) {}
```

| File | Holds |
| --- | --- |
| `src/git.ts` | Repository root, changed files, capped diffs, recent subjects, latest commit time, commit by paths, push target, push. Runs `git` through Effect's `ChildProcess`, as `tools-shell` does. |
| `src/plan.ts` | The evidence prompt and `Models.generateObject` with `small`; checks the plan and retries with the problem, up to 3 tries. |
| `src/index.ts` | The RPC handlers and the `commit` settings section (`push`, `ask` by default). |
| `src/tui/index.tsx` | The `/commit` command (`blocked: turnBlocked(chat, "commit")`), one flow at a time for the workspace, a `ComposerCover` active while it runs on the landing screen and in every session, and the endings as notifications. |
| `src/tui/flow.ts` | The archive's flow without checks: start, plan, review, apply, push. Esc stops planning; committing and pushing finish. |
| `src/tui/Commit.tsx` | The gallery's design, copied. |

Call path:

```text
/commit keep the docs separate, enter
  Composer clears the draft, ChatSend
  slash wrap: "commit" matches, keymap.runCommand("commit.run", { payload: "keep the docs separate" })
  keymapCommand: turnBlocked? -> Notifications.post(warning); slash puts the text back
  commit tui run(text) -> flow for the session; the cover shows Planning
    commit/start -> commit/plan (git evidence, generateObject small, check, retry)
    Review: enter -> commit/apply streams Committing, then Committed
    push setting -> commit/push-target -> Push question -> commit/push
  one notification for the ending; the flow clears and the draft returns
```
