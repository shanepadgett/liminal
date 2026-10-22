# @shanepadgett/liminal-tui

Liminal's terminal UI, on OpenTUI and Solid. `run(plugins)` loads each plugin's `tui` entry, composes the entries between its own two plugins and draws until the user quits. It needs a `Host` to reach the plugins.

| Plugin | Provides | Requires |
| --- | --- | --- |
| `tui`, first | `Host`, `Renderer`, `Slots`, `Dialogs` | |
| each `tui` entry | what it declares | what it declares |
| `tui-root`, last | | `Host`, `Renderer`, `Colors`, `Slots`, `Dialogs` |

`Colors` comes from the theme's `tui` entry; without one the TUI does not start. A `tui` entry that does not default-export a plugin fails with `EntryInvalid`.

## Slots

`Slots.fill(slot, component)` draws a component in a slot until the caller's scope closes. `defineSlot(name, mode)` makes a slot; `<SlotView slot={...}>` draws it. The root draws `screen`, where the last fill wins; `ctrl+c` quits until a screen takes it over.

## Dialogs

`Dialogs.open(dialog)` shows a dialog over a dimmed screen and returns a function that closes it; `escape` closes the top one.

## Hooks

| Hook | Gives |
| --- | --- |
| `useColor()` | The role colors on screen |
| `useSyntax()`, `useMix()` | The syntax style; a color mixer |
| `useRun()` | A function that runs an Effect needing `Host` or `Dialogs`; failures are logged |
| `useWatch(stream, initial)` | The stream's latest value, stopped with the component |
| `useSessionView(session)` | A session's events, deltas and `running` as a Solid store, and `loadOlder` |

## Kit

`kit` holds the shared components: `Chip`, `ChoiceRow`, `Dialog`, `Gradient`, `Hatch`, `Hints`, `Inked`, `ListRow`, `Logo`, `MatchedText`, `Overlay`, `Picker`, `Rule`, `Section`, `Spinner`. They read colors by role name from `@shanepadgett/liminal-client`.

Run it with Bun's `@opentui/solid/preload`, which compiles `.tsx`.
