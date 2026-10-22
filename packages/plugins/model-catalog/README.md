# @shanepadgett/liminal-model-catalog

Model details from [models.dev](https://models.dev), for providers to add to the models they list.

- `ModelCatalog.models(catalogId)`: the models models.dev lists under a provider id such as `anthropic`, each with its `ModelDetails`: context window, output limit, thinking levels, whether it takes images, tool calls and structured output, and price per million tokens.
- The cache is `~/.liminal/catalog.json`. It holds only the provider ids asked for. A provider it lacks is fetched at once; a cache older than a day refreshes in the background.
- With models.dev unreachable and nothing cached, `models` fails with `CatalogUnavailable` and the next call tries again. Providers then list their models without details and still make calls.

Requires `Directories`, `FileSystem`, `Path` and `HttpClient`.

## Use it in a provider

```ts
const details = (yield* ModelCatalog).models("acme").pipe(
  Effect.map((models) => new Map(models.map((model) => [model.id, model.details]))),
  Effect.catchTag("CatalogUnavailable", (error) =>
    Effect.as(Effect.logWarning(error.message), new Map<string, ModelDetails>()),
  ),
);
```

Replace `ModelCatalog` to read details from another source.
