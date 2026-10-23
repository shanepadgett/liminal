# @shanepadgett/liminal-model-favorites

Favorite models, kept as `model-favorites.models` in the global settings file.

## Contract

`./contract` exports `FavoritesSetting` and `FavoritesRpc`:

- `model-favorites/list`: the favorite model ids, in the order they were added.
- `model-favorites/toggle`: adds a model last, or takes it out, and returns the list as saved. It reads the file first, so an edit made there stays.

Requires `Settings` and `DeclaredSettings`.

## TUI

The `tui` entry wraps `model-choice`'s models picker. Favorites move to a Favorites section above the providers, the provider's name leading each detail. Ctrl+F adds the selected model or takes it out, and the picker stays open. It requires `Host`, `Dialogs` and `Pickers`.
