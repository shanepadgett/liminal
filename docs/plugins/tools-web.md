# tools-web

`websearch` and `webfetch`: search the web through the first searcher that works, and read a page as text.

Status: built

## Requires

- `Tools`

## Provides

- `WebSearchers`

## Requirements

- `WebSearchers` is an ordered registry; providers with their own search tool register at `searcherOrder.provider`, Exa at `searcherOrder.fallback`
- `model-anthropic` registers searchers for `anthropic` and `anthropic-api`; `model-openai` for `openai` and `chatgpt`; each on its cheap model, only when `tools-web` is loaded
- `websearch` takes `query`, optional `maxSources` (default 8, at most 12) and `timeout` in seconds (default 25)
- `websearch` tries searchers in order; one with others after it gets 70% of the time left; a failure moves to the next; when all fail, the call fails with each searcher's reason
- The answer lists its sources and names the searcher that answered
- Exa uses its free endpoint, or `EXA_API_KEY`; its searches start at least 2 seconds apart
- `webfetch` takes `url` and optional `timeout` (default 30); http and https only; text types only; at most 5 MB
- HTML becomes plain text with each link's address after its words; other text comes back as it is
- Both tools are deferred: the model loads them through tool search
- Rows read `Searched the web <query>` with the source count and `Fetched <url>`; opened, they show the end of the result

## References

- Tau `src/core/Web.ts`, `src/core/internal/web/`
