# tools-search

`tool_search`: the model finds and loads deferred tools, and a prompt section lists them.

Status: built

## Requires

- `PromptSections`, `SessionLog`, `Tools`

## Adds

- The `tool_search` tool
- The prompt section `tools-search/deferred`

## Requirements

- A tool with `offer: "search"` is deferred; `tool_search` loads it and its result names the loaded tools, so the next request offers them
- A query is keywords ranked over name, description and parameter text, or `select:a,b` to load named tools; `limit` defaults to 5, at most 20
- Common English stop words match nothing; a match scoring under a quarter of the best one is left out
- Search ranks often used tools higher, so they surface when there are many
- Use is the model's calls of each tool in this project's saved sessions; a call's weight halves every 30 days; nothing new is stored
- A stable prompt section lists each deferred tool by name and one line of description
- The listing holds about 1,000 tokens, most used tools first, then one line saying how many more search can find; later it tells only of added and removed tools
- The call reads as a work row: `Loaded <names>`, or `Searched tools <query>` when none matched

## References

- Codex `codex-rs/core/src/tools/handlers/tool_search.rs`, `codex-rs/core/src/context/world_state/tools.rs`
- Pi `packages/durable/src/tool-search/tool-search.ts`
- OpenCode `packages/core/src/codemode/catalog.ts`
