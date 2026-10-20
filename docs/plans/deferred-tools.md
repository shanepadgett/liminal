# Deferred tools

Rarely used tools stay out of the model's request and are reached when needed, so their schemas cost no tokens on every call. Nothing is built; the choices below are open.

## Today

- `offeredAtStart: false` declares a tool without offering it: the model's calls to it are refused until an offer. Only `ask_question` uses it, and `/qna` offers it.
- `toolkitOf` (`packages/sdk/src/ai/prompt.ts`) sends every declared tool to the provider, offered or not, so an unoffered tool costs its schema anyway.
- The `run` tool reaches tools the model was not offered, and the built-in `search` finds them. No tool is withheld from the request yet, so `search` has nothing extra to find.
- `websearch`, `webfetch` and `vocabulary` are offered from the first request. `docs/plans/daily-driver.md` and `docs/plugins/tools-web.md` expect the web tools to be deferred.

## Open

1. How a deferred tool is reached.
   - Through `run`: withhold the tool from the request; the model calls it in a script after `search` shows its schema. The tool list never changes, so the cache prefix holds. Calls read as inner rows under the `run` row.
   - Through a loader: a tool offers the deferred tool mid-conversation and later calls are direct. Calls read better, but the list changes mid-session, which breaks the cache on providers that need the full list up front (`core-contracts.md`, basic endpoints).
   - Recommendation: through `run`.
2. How the model learns a deferred tool exists: one line per tool (name and a short description) in the tools prompt section, or only through `search`.
3. What marks a tool deferred: a flag on `defineTool` beside `offeredAtStart`, or a user setting that moves any tool.
4. Whether `offeredAtStart: false` and the new flag are one concept (a tool nobody offered is withheld) or two (refused versus hidden).
5. Which tools move: `websearch`, `webfetch`, `vocabulary`; MCP tools arrive deferred.
6. How approvals and the transcript treat an inner call: the checks and approval already see inner calls of `run`; confirm the web tools' rows show.

## Next

Agree 1 to 4, then plan the code: the contract change in `defineTool`, `toolkitOf`, the tools prompt section, tests on the scripted provider and a provider that cannot change tools mid-conversation.
