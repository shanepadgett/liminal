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
| Esc | While a turn runs, stop it |
| Ctrl+C | Clear the draft; with no draft, quit |
| Ctrl+B | Open or close the sidebar, below 110 columns |

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
- Without a model in settings, it uses the default models of the first provider you are signed in to. With none, it stops with `No model provider is connected. Run liminal connect.`
- `--json` writes, instead of the reply, one JSON line per saved event and streamed delta, from your prompt to the turn's end.
- Ctrl-C cancels the turn, then exits.

Exit codes:

| Code | When |
| --- | --- |
| 0 | The turn answered |
| 1 | The turn failed or was cancelled, or a sign-in failed |
| 2 | Bad flags or arguments |
| 130 | Ctrl-C |

## Choose models

Set models in `~/.liminal/settings.json`, or in `.liminal/settings.json` in the folder you run Liminal in, which wins:

```jsonc
{
  "model": {
    "main": { "model": "anthropic/claude-sonnet-5-5", "thinking": "high" },
    "small": { "model": "anthropic/claude-haiku-5-5" },
  },
}
```

- `main` answers your prompts; `small` runs side calls.
- A model is named `provider/model`. `thinking` is optional.
- `attempts` sets how often a failing call is tried, the first try included. The default is 5.
- `classifier` names the model plugins use to classify, such as `openai/gpt-6-luna`. Unset, it is the first classifier a connected provider offers.
