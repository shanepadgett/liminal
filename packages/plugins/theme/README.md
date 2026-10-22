# @shanepadgett/liminal-theme

Liminal's colors, shared by every frontend. Components name colors by role (`RoleName` in `@shanepadgett/liminal-client`), never by ramp step, so a palette swap changes every component at once.

## Contract

| Export | What it is |
| --- | --- |
| `Palette` | A near-colorless base, one accent and the status hues, as OKLCH ramps |
| `ThemeSetting` | The `theme` key in `settings.json` |
| `ThemeRpc` | `theme/get`: the saved palette's id, or none. `theme/set`: saves one in the global file |
| `ThemeFailed` | The settings files could not be read or written |

## View

`./view` has no frontend framework, so any frontend can use it:

- `PALETTES`: `liminal` (the default), `afterhours`, `heure-bleue`, `conservatory` and `barbican`.
- `paletteOf(id)`: the palette named `id`, or the default one when `id` is unset or unknown.
- `roleColors(palette)`: each role's hex color.
- `mixHex(from, to, amount)`: a color part way between two, mixed in OKLCH.

## TUI

The `tui` entry provides `Colors` from `@shanepadgett/liminal-tui`: the saved palette's role colors, its syntax style for code, markdown and diffs, and `mixHex`. When `theme/get` fails, it logs a warning and uses the default palette.

Requires `Settings` and `DeclaredSettings`; the `tui` entry requires `Host` and `Renderer`.

## Settings

```jsonc
{
  "theme": { "palette": "barbican" },
}
```
