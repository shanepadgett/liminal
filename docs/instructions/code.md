# Code

## Design

- Fix the cause. If the code resists a change (a new flag, a copied block, a special case), restructure it first.
- Reuse before writing. Search the workspace for an existing function, type or service first.
- Put code beside the concept it serves. No shared grab-bag modules.
- Build for the caller in front of you. No option, hook or abstraction for a caller that does not exist.
- Trust the types inside the boundary. Parse untrusted input once, at the edge.
- No fallback paths or compatibility shims. Change the callers.
- Model states that exclude each other as a tagged union, not optional fields or flags.

## Naming

- Use the product vocabulary for domain names: turn, step, entry, session store.
- Name by domain meaning, not type or mechanism: `pendingToolCalls`, not `list`.
- One word per concept. Check how the repo already names it.
- Functions are verbs that state the outcome. Booleans read as questions: `isIdle`, `hasCredentials`.
- Bind a condition with more than two clauses to a named constant.

## Flow

- A function does one thing at one level of detail. Its top reads as a summary of the steps.
- Handle failures and edge cases first and return. Keep the main path at the lowest indent.
- Return new values. Do not mutate arguments or shared state.
- Use plain functions for pure logic. Use Effect when there is failure, async work, a resource or a dependency.
- One concept per file.

## Effect

- Write sequences with `Effect.gen`. Write named effectful functions with `Effect.fn("name")`, never a function that returns `Effect.gen`.
- Pass retry, timeout and spans as extra arguments to `Effect.fn`. Use `.pipe` only for short one-way transforms. Do not nest `pipe` chains.
- Raise errors with `return yield*`.
- Expected failures are `Schema.TaggedError` classes named for the domain (`SessionNotFound`) that carry what the caller needs. Bugs are defects. Handle an error only where something can be done about it.
- Parse unknown data with `Schema`. Use `Predicate` instead of hand-written guards.
- A service owns one capability behind a small interface. Its methods require nothing; dependencies come from its layer.
- Time, randomness, ids and the file system come from services, never globals.
- Acquire resources in a scope. Never release by hand.

## Comments and messages

- Comment why: a constraint, a tradeoff, a surprise. If a comment says what the code does, rename or extract instead.
- Describe the code as it is now. No history.
- An error message says what failed, names the value and says what to do next.
- Use short sentences, common words and the active voice.

## Checked

- `unknown` is allowed only for `cause` and type-guard subjects. Parse at the boundary instead. (`liminal/no-unknown-parameters`)
- Every `as` cast needs a comment saying why it holds. Prefer narrowing. (`liminal/assertion-needs-reason`)
- `Effect.run*` belongs only in `apps/`. (`liminal/no-effect-run`)
- Branch on tags with `Match`, `Effect.catchTag` or `Predicate.isTagged`, not `_tag ===`. (`liminal/no-manual-tag-check`)
- Doc comments use `/** */`. No em dashes. (`liminal/prefer-jsdoc`, `liminal/no-em-dash`)
- Every lint disable ends with `-- <reason>`. (`liminal/disable-needs-reason`)
