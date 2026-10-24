# @shanepadgett/liminal-web-search-openai

OpenAI's hosted web search for `websearch`, in sessions on `openai` and `codex` models.

Adds one `WebSearchers` entry per provider, named `OpenAI`. A search runs on that provider's `small` default, never the session's model, through `model-wire`'s `hostedSearch` with `responsesSearch`. A missing or signed-out provider, or a failed search, fails the search, and `tools-web` asks Exa.

Requires `ModelProviders` and `WebSearchers`.
