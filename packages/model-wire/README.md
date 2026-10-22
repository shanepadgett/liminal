# @shanepadgett/liminal-model-wire

The wire code model providers share: a library, not a plugin.

## `./messages`

Anthropic's Messages API through Effect AI's Anthropic provider.

- `messagesModel(options, model, { thinking, outputLimit })`: an Effect AI `LanguageModel` for `model`. `options` sets the key, address and client changes. Thinking `off` turns thinking off; any other level, such as `low`, `high` or `max`, is sent as the effort. `outputLimit` is sent as `max_tokens`; unset leaves Effect AI's default for the model.
- `messagesModels(options)`: the API's models, by id and display name.

Both require an `HttpClient`.
