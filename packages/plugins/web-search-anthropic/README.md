# @shanepadgett/liminal-web-search-anthropic

Anthropic's hosted web search for `websearch`, in sessions on `anthropic` models.

Adds one `WebSearchers` entry named `Claude`. A search runs on the provider's `small` default, never the session's model, through `model-wire`'s `hostedSearch` with `messagesSearch`: `web_search_20250305`, at most 3 searches a call, billed by Anthropic. A missing or signed-out provider, or a failed search, fails the search, and `tools-web` asks Exa.

Requires `ModelProviders` and `WebSearchers`.
