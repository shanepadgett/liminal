# Liminal

Liminal is an agent harness where everything is a plugin, built on Effect and Bun.

## Start here

Read `docs/status.md` first: the current milestone, next steps and open questions. Read anything else only when the task needs it.

| Read | When |
| --- | --- |
| `docs/architecture.md` | Planning or writing code; only the sections the task touches |
| The milestone's `docs/plugins/` work file | Building that milestone's plugins; only that plugin's section |
| `docs/extension-basics.md` | Choosing between Add, Wrap, Attach and Replace |
| `archive/` | Checking how the previous implementation did something; read-only, never imported |

## Instructions

Read an instruction file only when you are about to do the work it covers.

| Read | Only when |
| --- | --- |
| `.liminal/instructions/code.md` | Writing or changing code in `apps/`, `packages/` or `tools/` |
| `.liminal/instructions/core.md` | Changing `packages/core` or a base plugin's contract |
| `.liminal/instructions/plugins.md` | Building or changing a plugin |
| `.liminal/instructions/dependencies.md` | Writing code against a dependency, or adding or updating one |
| `.liminal/instructions/docs.md` | Writing or changing a file in `docs/` |
| `.liminal/instructions/planning.md` | Planning work, in chat or in `docs/plans/` |
| `.liminal/instructions/tools.md` | Changing lint rules, checks, fallow config or reference tooling |
| `.liminal/instructions/gallery.md` | Changing `apps/gallery`, or taking a design from it into the product |
| `.liminal/instructions/instructions.md` | Changing `AGENTS.md` or `.liminal/instructions/` |

## Scope

- Architecture and long-term health come first. Never bend a seam to get something working.
- Build only what the current milestone lists; anything else goes under Later in `docs/status.md` until the user asks for it.
- Solve the common case. No mechanism, option or special case for an edge case few users hit.
- No tests until the test milestone.

## Requests

- When a request is clear, has one obvious way to work and fits the architecture, build it without planning or asking first, even when the change is not small.
- When the paths diverge on something only the user can weigh, such as product behavior or a costly-to-undo choice, stop and ask with your recommendation. Never push a request through just to finish it.

## Subagents

- Do not spawn subagents for trivial work such as file lookups, grep or reading known paths. Do it directly. Use one only for broad, multi-step research that would otherwise flood the context.

## Grounding

- Never answer from memory when the answer can change over time: APIs, versions, tool behavior. Ground it in the codebase, `docs/reference/`, the reference repositories or a web search, and say which.
