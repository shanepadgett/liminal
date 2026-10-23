# @shanepadgett/liminal-tools-web

The `websearch` and `webfetch` tools, and the `WebSearchers` registry of hosted searches.

## `websearch`

Takes `{ query }`. The session's model's provider's hosted search answers when one is in `WebSearchers`; otherwise, or when it fails, Exa's free MCP search answers. Each search has 30 seconds.

- Exa needs no key and answers with up to 8 sources. Its searches start at least 2 seconds apart. Past its free limit the search fails.
- The model sees a line marking the content as untrusted web data, the answer, a `Sources:` list and `Searched with <name>.` When both fail, it sees both reasons.
- Beside it the tool saves `tools-web/searched` `{ callId, searcher, sources }`.
- Its `access` is `noAccess`: the query goes only to the searcher.

## `webfetch`

Takes `{ url }`, an http or https address without a user name or password. It follows redirects and has 30 seconds.

- Reads text types only, up to 5 MB, and tells the model to download anything else with `shell`.
- HTML comes back as light Markdown: `#` headings, `-` list items, fenced `pre`, inline code and `[words](url)` links, through Bun's `HTMLRewriter`. Scripts, styles and other hidden content are dropped.
- The model sees the untrusted line, then `URL`, `Status` and `Type` lines for the final address, then the text. `tool-output` cuts a long page.
- Beside it the tool saves `tools-web/fetched` `{ callId, url, status, type }`.
- It has no `access`, so it counts as `run` and goes through approvals: an address can carry data out.

Requires `Tools`, `SessionLog` and `HttpClient`. Provides `WebSearchers`.

## Contract

- `WebSearchers`: a registry of `WebSearcher` `{ provider, name, search }`; `provider` is a `ModelProvider` id. Of two for one provider, the one added last is used.
- `WebAnswer` `{ text, sources }`, `WebSource` `{ url, title }`, `SearchFailed`.
- `Searched` and `Fetched`: the saved events.
- `websearchName`, `webfetchName`: the tools' names.

## `tui` entry

Adds both rows to `ToolRows`. The `websearch` row shows the query, then `N sources, <searcher>`; a click opens the sources. The `webfetch` row shows the address, then the status and type.

## Replace it

Add a tool named `websearch` or `webfetch` after `tools-web`; of two tools with one name, the one added last is used. Add a hosted search with `WebSearchers.add`.
