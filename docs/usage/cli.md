# The `liminal` command

Run it from the repository with `bun apps/cli/src/main.ts`, or as `liminal` once the `@shanepadgett/liminal-cli` package is linked.

## Connect a provider

```sh
liminal connect
```

1. Pick a provider, then a login. A list with one choice is skipped.
2. Follow the steps. A browser login opens your browser; when the browser cannot come back to Liminal, such as over SSH, paste the address it ends on.
3. `Connected.` means the login is saved in `~/.liminal/liminal.db`. Liminal refreshes expired tokens itself.

Logins:

| Provider | Login | Instead of a login |
| --- | --- | --- |
| Anthropic | Claude subscription (Pro or Max), or an API key | `ANTHROPIC_API_KEY` |

A saved login wins over the environment variable.

## Send one prompt

```sh
liminal -p "Explain this error"
git diff | liminal -p "Review this change"
```

- `-p` starts a new session, sends the prompt and prints the final reply on stdout.
- Piped input goes after the prompt.
- Notices, such as why a turn stopped, go to stderr.
- Without a model in settings, it uses the default models of the first provider you are signed in to. With none, it stops with `No model provider is connected. Run liminal connect.`

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
