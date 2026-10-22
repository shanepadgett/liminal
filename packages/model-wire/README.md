# @shanepadgett/liminal-model-wire

The wire code model providers share: a library, not a plugin.

## `./messages`

Anthropic's Messages API through Effect AI's Anthropic provider.

- `messagesModel(options, model, { thinking, outputLimit })`: an Effect AI `LanguageModel` for `model`. `options` sets the key, address and client changes. Thinking `off` turns thinking off; any other level, such as `low`, `high` or `max`, is sent as the effort. `outputLimit` is sent as `max_tokens`; unset leaves Effect AI's default for the model.
- `messagesModels(options)`: the API's models, by id and display name.

Both require an `HttpClient`.

## `./responses`

OpenAI's Responses API through Effect AI's OpenAI provider.

- `responsesModel(options, model, { thinking, cacheKey })`: an Effect AI `LanguageModel` for `model`. `options` sets the key, address and client changes. Nothing is stored on the server, so each request carries the whole conversation and its encrypted reasoning. Thinking `off` is sent as effort `none`; any other level, such as `low`, `high` or `xhigh`, is sent as the effort, with reasoning summaries. `cacheKey` is sent as `prompt_cache_key`.

Requires an `HttpClient`.
