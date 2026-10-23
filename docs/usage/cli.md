# The `liminal` command

Run it from the repository with `bun apps/cli/src/main.ts`, or as `liminal` once the `@shanepadgett/liminal-cli` package is linked.

## Chat in the terminal

```sh
liminal
```

With no flags, Liminal opens its terminal UI. Write a prompt and press Enter; the first send starts a new session. The reply streams into the transcript, and the sidebar shows the folder, the git branch and how much of the model's context window the session uses.

| Key | Does |
| --- | --- |
| Enter | Send; while a turn runs, steer it |
| Shift+Enter | New line |
| Tab | While a turn runs, send as a follow-up |
| Esc | Close the open sidebar; otherwise, while a turn runs, stop it |
| Shift+Tab | The next thinking level of the model on the model line, when it has more than one |
| Ctrl+S | Stash the draft: save it for this folder and clear the composer |
| Ctrl+C | Clear the draft; with no draft, quit |
| Ctrl+B | Open or close the sidebar, below 110 columns |
| Ctrl+N | New session: back to the start screen; nothing is saved until you send |
| Ctrl+O | Open a saved session. See below |
| Ctrl+P | The command palette: every command with its keys, by category. Enter runs one |
| Ctrl+G | Show every key hint on a line too narrow for them, in columns; again to go back to one line |

The line under the draft shows the model line, `◇ model • thinking`, and only the keys that would do something now. Enter and Esc come first. When the keys do not fit, the line ends with `ctrl+g more`. Lists and dialogs leave out hints for Up, Down, Enter and Esc; those keys still work. The draft's keys stop while a dialog is open.

### Commands with `/`

Type `/` as the first character of the draft to list commands. Keep typing to filter; Up and Down move, Enter runs the command, Tab completes its name, Esc closes the list.

| Command | Does |
| --- | --- |
| `/new` | New session, as Ctrl+N |
| `/sessions` | Open a saved session, as Ctrl+O |
| `/model` | Pick a model. See below |
| `/connect` | Connect a provider, as `liminal connect` does. See below |
| `/theme` | Pick a palette. Moving through the list shows each; Enter saves it, Esc puts the saved one back |
| `/pop` | List this folder's stashes. Enter puts one back after the draft and removes it from the list; Ctrl+D asks, then removes it |

### Open a saved session

Ctrl+O lists this folder's latest 100 sessions, newest first, under Today, Yesterday and Earlier. Each is named by the first line of its first message and shows when it was last active. Enter opens it. A session appears once you send in it.

### Connect from the TUI

`/connect` asks for the provider and the login, skipping a list of one, then follows the sign-in in a dialog. A browser login opens your browser and shows the link; Ctrl+Y copies the link, or the code of a device code login. Type an API key or a pasted address and press Enter. Esc closes the dialog and stops the sign-in.

### Pick a model

`/model` lists the models of the providers you are signed in to, a section per provider, with each model's context window. Favorites sit on top. Keep typing to filter.

| Key | Does |
| --- | --- |
| Enter | Pick the model, at the model line's thinking level when it has it |
| Ctrl+D | Save the model as the default new sessions start on |
| Ctrl+F | Add the model to Favorites, or take it out |
| Esc | Close the list |

A pick shows on the model line and goes with your next send from that screen; nothing is saved until then. Each session keeps the model it last ran. See [Choose models](#choose-models).

### Tag files with `@`

Type `@` at the start of the draft or after a space to list the workspace's files and folders: those Git tracks, and untracked ones it does not ignore. Keep typing to filter; files you tag often come first. Outside a Git repository the list is empty, but a typed `@path` still works.

| Key | Does |
| --- | --- |
| Up, Down | Move through the list |
| Enter | Tag the file or folder |
| Tab | Open the folder, listing what is in it |
| Esc | Close the list until the cursor leaves the tag |

A tag is one unit: the cursor steps over it, and Backspace removes it whole. Write a path with spaces as `@"my file.txt"`.

When you send, each tagged file's text goes with the message: the first 2000 lines or 50 KB, with a note when more is left out. A folder sends the names one level down, up to 200. A binary file or one that cannot be read sends a short note instead. The transcript shows only what you wrote. Print mode reads tags the same way:

```sh
liminal -p "Summarize @README.md"
```

`liminal --help` lists the commands and flags.

## Connect a provider

```sh
liminal connect
```

1. Pick a provider, then a login, then how to sign in. A list with one choice is skipped.
2. Follow the steps. A browser login opens your browser; when the browser cannot come back to Liminal, such as over SSH, paste the address it ends on. A device code login shows a code to enter on any device.
3. `Connected.` means the login is saved in `~/.liminal/liminal.db`. Liminal refreshes expired tokens itself.

Logins:

| Provider | Login | Instead of a login |
| --- | --- | --- |
| Anthropic | Claude subscription (Pro or Max), or an API key | `ANTHROPIC_API_KEY` |
| OpenAI | An API key, for `openai/` models | `OPENAI_API_KEY` |
| OpenAI | Sign in with ChatGPT, in the browser, for `chatgpt/` models on your ChatGPT plan | none |
| OpenAI | Codex (ChatGPT plan), in the browser or with a device code, for `codex/` models | none |
| OpenRouter | An API key | `OPENROUTER_API_KEY` |
| OpenCode Go | An API key | `OPENCODE_API_KEY` |

A saved login wins over the environment variable. Each OpenAI login is saved apart, so all three can be connected at once.

An API key login can save a command that prints the key instead of the key itself, such as `op read op://Private/OpenAI/key`. Liminal runs it once at sign-in to check it, then once per run when a model call first needs the key, and keeps only its output in memory.

## Log out

```sh
liminal logout
```

Pick a connected provider. Liminal removes its saved login. Sign in with ChatGPT and Codex also end the login at OpenAI. When OpenAI does not confirm that, the login is still removed here, and the message says how to disconnect Liminal in ChatGPT settings.

## Send one prompt

```sh
liminal -p "Explain this error"
git diff | liminal -p "Review this change"
```

- `-p` starts a new session, sends the prompt and prints the final reply on stdout.
- Piped input goes after the prompt.
- Notices, such as why a turn stopped, go to stderr.
- `--session <id>` sends in that saved session instead of a new one. An unknown id stops with an error.
- `--model provider/model` runs that model, such as `--model anthropic/claude-opus-5-5`. Without it, the session runs the model chosen as in [Choose models](#choose-models). With no provider signed in, it stops with `No model provider is connected. Run liminal connect.`
- `--json` writes, instead of the reply, one JSON line per saved event and streamed delta, from your prompt to the turn's end.
- Ctrl-C cancels the turn, then exits.

Exit codes:

| Code | When |
| --- | --- |
| 0 | The turn answered |
| 1 | The turn failed or was cancelled, a sign-in failed, or the session was not found |
| 2 | Bad flags or arguments |
| 130 | Ctrl-C |

## Choose models

Set models in `~/.liminal/settings.json`, or in `.liminal/settings.json` in the folder you run Liminal in, which wins:

```jsonc
{
  "model-choice": {
    "default": { "model": "anthropic/claude-sonnet-5-5", "thinking": "high" },
  },
  "model": {
    "small": { "model": "anthropic/claude-haiku-5-5" },
  },
}
```

- Each session keeps the model it last ran. A new session runs `model-choice.default`, else the model you picked last in any session, else the default of the first provider you are signed in to. In the TUI, `/model` picks one and Ctrl+D in its picker saves the default.
- `small` runs side calls.
- A model is named `provider/model`. `thinking` is optional.
- `attempts` sets how often a failing call is tried, the first try included. The default is 5.
- `classifier` names the model plugins use to classify, such as `openai/gpt-6-luna`. Unset, it is the first classifier a connected provider offers.
