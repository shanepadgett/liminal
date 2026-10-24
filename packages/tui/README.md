# @shanepadgett/liminal-tui

Liminal's terminal UI, on OpenTUI and Solid. `run(plugins)` loads each plugin's `tui` entry, composes the entries between its own two plugins and draws until the user quits. It needs a `Host` to reach the plugins.

| Plugin | Provides | Requires |
| --- | --- | --- |
| `tui`, first | `Host`, `Renderer`, `Slots`, `Dialogs`, `Keymap`, `Pickers` | |
| each `tui` entry | what it declares | what it declares |
| `tui-root`, last | | `Host`, `Renderer`, `Colors`, `Slots`, `Dialogs`, `Keymap`, `Pickers` |

`Colors` comes from the theme's `tui` entry; without one the TUI does not start. A `tui` entry that does not default-export a plugin fails with `EntryInvalid`.

## Slots

`Slots.fill(slot, component)` draws a component in a slot until the caller's scope closes. `defineSlot(name, mode)` makes a slot; `<SlotView slot={...}>` draws it. The root draws `screen`, where the last fill wins; `ctrl+q` quits until a screen takes it over. Every `escape` binding answers `ctrl+c` too, so `ctrl+c` cancels wherever `esc` does, and with nothing to cancel does nothing; it never quits. A fill's component returns one element that stays: when the element it returns changes, the slot draws the component again from fresh state. A fill that throws while it draws is logged as an error, and its slot draws as if it were not there.

## Dialogs

`Dialogs.open(view)` shows a dialog over a dimmed screen and returns a function that closes it. `view` is `(close) => element`. Opening one takes focus from what had it, such as the draft, so keys bound to the draft stop; `escape` closes the top one, and closing it focuses that again.

## Commands

`Keymap` is the TUI's OpenTUI keymap. `registerCommands(commands, keys)` adds app-wide commands and the keys that run them until the caller's scope closes. A `Command` has a `name`, a `title`, a `run`, and optionally a `category`, a `slash` name with `aliases`, a `hint` and `enabled`. While `enabled` reads false, the command neither runs nor shows its hint, and its key passes on.

A `hint` is `{ label, keys?, important? }`, shown beside the command's first key; `keys` sets other key text, such as `↑↓` for up and down shown together. Important hints come first on a line, so they stay when it cannot fit them all. Keys every user expects, such as Up, Down, Enter and Esc in a list or dialog, have no hint. `keymapCommand(command)` gives the keymap's form of a command, for `useBindings` in a component; `commandLayer(commands, keys, target?)` gives a layer, active only while `target` or something inside it has focus.

A hint shows only for a key that would run now. `activeHints(keymap)` reads them from the keymap's active keys: important hints first, then higher-priority layers, then newer layers. A key shows once, for the command that wins it. `useHints()` gives them as an accessor, which every hint line uses. `useHintsWithin(root)` gives them only while focus sits on `root` or inside it, so a part of the screen behind a dialog shows none.

`kit.Hints` draws a hint line in the width it has, never splitting a hint; `end` puts it against the right edge. When the hints do not fit, it shows the leading ones and `ctrl+g more`. `ctrl+g`, bound by the root with no target so it works under dialogs too, switches every such line to all its hints in columns, filled top to bottom, with `ctrl+g less` last. A line that fits looks the same either way. `Dialog` draws its hint line only when it has hints.

`listCommands(keymap)` reads back the commands reachable now, with their keys; `slashCommands` keeps those with a slash name.

## Pickers

`openPicker(spec)` opens the kit's `Picker` in a dialog. A `PickerSpec` is the picker's props plus a `name`, such as `stash/stashes`. Rows with a `section` sit under its title; `sectionDetail` puts a note on the right of a title. An action's `when` limits its key and hint to the rows it acts on. A destructive action or pick asks first with `confirm` or `confirmSelect`: the question and `enter yes esc no` take the hints' row in the footer, and typing drops the question. A dialog's footer row stays when no key applies, so it keeps its height. Every spec passes through the `Pickers` pipeline before it opens, so a plugin can wrap a picker by its name to change its rows or add keys.

The picker filters its rows with `fuzzysort` as the user types, and groups them by `section`. Up and Down move, Enter calls `onSelect` and closes, Esc closes; none of the four shows a hint. Each action is a key with a label in the hints; a label can be a function of the selected row, such as `favorite` or `unfavorite`; it closes the picker unless `keepsOpen` is set. Enter and the actions work, and show their hints, only while a row is selected, and Up and Down only with more than one row. The picker's keys work while its input has focus. `onMove` runs as the selection moves and `onClose` when it closes. `initial` names the row selected when it opens.

## Hooks

| Hook | Gives |
| --- | --- |
| `useColor()` | The role colors on screen |
| `useSyntax()`, `useMix()` | The syntax style; a color mixer |
| `useRun()` | A function that runs an Effect needing `Host` or `Dialogs`; failures are logged |
| `useWatch(stream, initial)` | The stream's latest value, stopped with the component |
| `useSessionView(session)` | A session's events, deltas and `running` as a Solid store, and `loadOlder` |

Outside components, a `tui` entry's commands run effects with `makeEntryRun(message)`: it gives an `EntryRun` that forks into the entry's scope and logs a failure with `message`.

## Kit

`kit` holds the shared components: `Chip`, `ChoiceRow`, `Dialog`, `Diff`, `Gradient`, `Hatch`, `Hints`, `Inked`, `ListRow`, `Logo`, `MatchedText`, `Overlay`, `Picker`, `Porter`, `Rule`, `Section`. `Overlay` sets a dialog in the middle of the screen. Any dialog asks before a destructive action the same way: `useConfirm()` keeps the question and binds enter and esc above the dialog's keys, and `Dialog`'s `confirming` draws it in the footer. `Diff` draws a unified patch with line numbers and the file's syntax colors, and `changesOf(patch)` counts the lines it adds and removes. `Porter` is the little face that murmurs words while a turn works; give him `words` and `poses` (`{ face, weight, hold }`, each face seven cells) in place of his own, and a single word holds still. `useInkHead` paces streaming text so `Inked` writes it out evenly, however it arrives. They read colors by role name from `@shanepadgett/liminal-client`.

Run it with Bun's `@opentui/solid/preload`, which compiles `.tsx`.
