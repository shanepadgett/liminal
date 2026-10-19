# theme

The palette the TUI draws in: kept in the `theme` setting and picked with `/theme`.

Status: built

## Provides

- None

## Requires

- Settings

## Adds

- Settings section `theme`: `palette`, the id of one of the five palettes (`liminal`, `afterhours`, `heure-bleue`, `conservatory`, `barbican`)
- RPCs: `theme/get` reads the saved id, `theme/set` writes it to the global settings
- TUI: `/theme`, also in the command palette

## Requirements

- Liminal is the palette when `theme.palette` is unset or names no palette
- The TUI starts in the saved palette; global and project settings both apply, the project's winning
- `/theme` lists the five palettes with their mood
- The screen shows each palette as the highlight reaches it
- Enter saves the highlighted palette to the global settings
- Esc puts the previous palette back and saves nothing
- A settings file that cannot be read leaves the default palette
