# @shanepadgett/liminal-model-catalog

Provides `model`'s `ModelCatalog` from [models.dev](https://models.dev).

- `ModelCatalog.models(catalogId)`: the models models.dev lists under a provider id such as `anthropic`, each with its `ModelDetails`: context window, output limit, thinking levels (`off` first when thinking can be turned off, by a toggle or the `none` effort), whether it takes images, tool calls and structured output, and price per million tokens, with the higher prices models.dev lists for requests whose input passes a size, such as 272K tokens. Each has a `kind` from models.dev's `type`; a missing `type` is `chat`. Each has a `wire` from the AI SDK package models.dev names for it, or for its provider: `@ai-sdk/anthropic` is `messages`, `@ai-sdk/openai` is `responses`, `@ai-sdk/openai-compatible` is `chat`, and any other leaves it unset.
- The cache is `~/.liminal/catalog.json`. It holds only the provider ids asked for. A provider it lacks is fetched at once; a cache older than a day refreshes in the background.
- With models.dev unreachable and nothing cached, `models` fails with `CatalogUnavailable` and the next call tries again.

Requires `Directories`, `FileSystem`, `Path` and `HttpClient`. Replace it to read details from another source.
