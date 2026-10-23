# @shanepadgett/liminal-model-wire

The wire code model providers share: a library, not a plugin.

## `./messages`

Anthropic's Messages API through Effect AI's Anthropic provider.

- `messagesModel(options, model, { thinking, outputLimit, toolChanges })`: an Effect AI `LanguageModel` for `model`. `options` sets the key, address and client changes. Thinking `off` turns thinking off; any other level, such as `low`, `high` or `max`, is sent as the effort. `outputLimit` is sent as `max_tokens`; unset leaves Effect AI's default for the model. `toolChanges` go as `tool_addition` and `tool_removal` blocks with the inline tools beta; Effect AI knows neither, so the request body is rewritten on the way out.
- `messagesModels(options)`: the API's models, by id and display name.

Both require an `HttpClient`.

## `./responses`

OpenAI's Responses API through Effect AI's OpenAI provider.

- `responsesModel(options, model, { thinking, cacheKey, toolChanges })`: an Effect AI `LanguageModel` for `model`. `options` sets the key, address and client changes. Nothing is stored on the server, so each request carries the whole conversation and its encrypted reasoning. Thinking `off` is sent as effort `none`; any other level, such as `low`, `high` or `xhigh`, is sent as the effort, with reasoning summaries. `cacheKey` is sent as `prompt_cache_key`. `toolChanges` go as `additional_tools` items, written into the request body on the way out.

Requires an `HttpClient`.

## `./chat`

Chat Completions, the OpenAI request format most other hosts copy, through Effect AI's OpenAI-compatible provider.

- `chatModel(options, model, { thinking })`: an Effect AI `LanguageModel` for `model`. `options` sets the key, address and client changes. Thinking `off` is sent as `reasoning_effort: none`; any other level is sent as the effort, which the API checks.

Requires an `HttpClient`.

## `./search`

A provider's own web search, run on its `small` model.

- `hostedSearch(providers, id, toolkit, query)`: finds provider `id` in `providers` when it runs, runs its `defaults.small` through its `languageModel` with `toolkit`'s search tool required, and answers `{ text, sources }`, up to 8 sources. A provider is any value shaped as a `SearchProvider`, such as a `ModelProvider`. Fails with `NotSearched` when the provider is missing or signed out, or no search succeeded.
- `messagesSearch`: Anthropic's `web_search_20250305`, at most 3 searches a call. `responsesSearch`: OpenAI's `web_search`.

## `./decisions`

OpenAI's Decisions API through Effect AI's OpenAI provider.

- `decisionsModel(options, model)`: an Effect AI `DecisionModel` for the classifier `model`, such as `gpt-6-luna`. `options` sets the key, address and client changes. Effect AI checks each answer.

Requires an `HttpClient`.
