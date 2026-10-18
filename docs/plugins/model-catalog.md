# model-catalog

Model details from the `models.dev` catalog, cached on disk.

Status: built

## Provides

- `ModelCatalog` service: `models(catalogId)`

## Requirements

### Catalog

- Lists the tool-calling models `models.dev` has under a catalog id, with name, limits, input kinds, prices and thinking options
- Each catalog entry decodes on its own; a bad entry is skipped
- An unknown catalog id or an unreachable `models.dev` with no cached copy fails with `CatalogUnavailable`
- No bundled snapshot

### Cache

- Keeps only the catalog ids providers asked for in `<Directories.data>/catalog.json`
- Startup reads the cache; a cache older than one day refreshes in the background
- A failed refresh keeps the old cache
- Replaceable like `credential-store`

### Thinking options

- Effort values as given; effort wins over a token budget
- A token budget gives `low` (the minimum, 1024 when none), `medium` (a quarter), `high` (half) and `max` (the output limit less one), labelled with tokens
- A toggle adds `off` unless an effort offers `none`; alone it gives `off` and `on`
- The default option is `medium` when offered, else the middle one

## References

- Tau `src/ai/Catalog.ts`, `src/ai/internal/catalog/models-dev.ts`
- OpenCode `packages/core/src/variant.ts`
