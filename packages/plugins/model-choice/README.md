# @shanepadgett/liminal-model-choice

Which model each session runs. A session runs its latest pick; a new session runs the saved default, else the newest pick in any session, else the first signed-in provider's default.

## Contract

`./contract` exports:

- `ModelPick`: the `model-choice/pick` attribute on an input, the model the user picked to run it.
- `Picked`: the `model-choice/pick` event. The session runs this model from here on.
- `ModelChoiceSetting`: the `model-choice` key in `settings.json`, with the `default` a new session starts on.
- `MODELS_PICKER`: the models picker's name, for a `Pickers` wrap.
- `ModelChoiceRpc`: `model-choice/session` (the model a session runs next; without a session, the model a new one starts on), `model-choice/default` and `model-choice/set-default` (saved in the global settings file).

The plugin wraps `loop`'s `SessionModel` with the rules above, and `loop`'s `Send`: before an input, it logs a `Picked` event when the input's pick, or the session's model on its first input, changes what the session runs, then drops the attribute. With no model to fall back on it logs nothing, and the turn fails saying no provider is connected. It requires `Send`, `SessionModel`, `SessionLog`, `Settings` and `DeclaredSettings`.

```jsonc
{
  "model-choice": {
    "default": { "model": "anthropic/claude-sonnet-5-5", "thinking": "high" },
  },
}
```

## TUI

| Key | Does |
| --- | --- |
| `/model` | Open the models picker |
| Shift+Tab | While the draft has focus: the next thinking level of the model on the line, when it takes more than one |

The picker has a section per provider; each row is a model, with its context window and `default` on the saved default. Enter picks the model at the line's thinking level when it takes it. Ctrl+D saves the selected model as the default and keeps the picker open.

A pick waits on the screen it was made on, the landing or a session, and goes with that screen's next send through chat's `ChatSend`. Nothing is saved until then. The model line, `model • thinking`, fills chat's `status` slot: the waiting pick, else the model the session runs, at the level it runs at; a choice without a level shows the model's `defaultThinking`. While no provider is connected it reads `/connect to link a provider`. The line and the models load again when the last dialog closes, so connecting or disconnecting shows at once. `ModelSelection` gives other plugins what the line shows, so a side job such as `/commit` runs beside the selected model. The `tui` entry provides `ModelSelection` and requires `Host`, `Keymap`, `Dialogs`, `Pickers`, `ChatScreen`, `ChatSend` and `Slots`.
