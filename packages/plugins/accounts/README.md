# @shanepadgett/liminal-accounts

Saved credentials and the logins that create them.

- `Credentials`: one credential per provider in `liminal.db`. A credential is an API key, OAuth tokens (access, refresh, expiry and provider extras such as an account id), or a command that prints an API key. `key` gives a saved key or the command's output; a command runs with `sh -c` once per process, and a failed run is tried again next time. `fresh` gives OAuth tokens, refreshing them within a minute of expiry inside one write, so one process refreshes. `remove` deletes the credential.
- `LoginMethods`: the registry providers add their logins to. A login names the provider its credential is saved under, the vendor menus group it under, such as `OpenAI`, the kind of credential it saves (`key` for an API key or a command that prints one, `oauth` for tokens), and one or more ways through it, such as the browser or a device code. A way runs against `LoginFlow`: open a URL, show a code, ask, ask for a secret, show waiting, tell, and sign in through the browser. A login's optional `logOut` ends it on the provider's side, such as revoking a refresh token.
- `apiKeyMethod(provider, vendor)` is a login with two ways: the key, or a command that prints it. Sign-in runs a command once before saving it.
- `authorizeInBrowser` signs in with PKCE. The browser comes back to a local server, or the user pastes the address it ends on. When the port is taken, only the pasted address works. It gives the code, the verifier, and the `client_id` the reply names, which a login that registers a client on first sign-in needs.
- `AccountsRpc`: `accounts/methods` (vendors in the order their logins were added, each vendor's subscriptions before its API keys, with whether each login is connected: its provider has the kind of credential it saves), `accounts/sign-in` of a login and way (a stream of steps for the screen), `accounts/answer` (what the user types for an `Ask` step) and `accounts/logout` of a provider. Logout runs the `logOut` of each of the provider's logins, removes the credential even when one fails, then fails with `LogoutFailed`. `liminal connect` asks for the vendor, the login and the way, skipping a choice of one; `liminal logout` asks for a connected provider.
- A sign-in that sends `OpenUrl` first opens the browser itself, on the machine whose local server catches the redirect; when that fails it also sends `Told` saying to open the link. Frontends only show the link.

Requires `SqlClient`, `Crypto` and `ChildProcessSpawner`.

## TUI

The `tui` entry adds `/connect` (category Model): a vendor picker (`accounts/vendors`), then a picker of the ways to sign in, under their logins (`accounts/logins`), skipping a list of one. A connected vendor, and a connected login's section title, say `connected`. In both pickers, `ctrl+d` on a connected row asks in the footer, then disconnects it: a vendor's connected logins, or a way's login. The pick opens a sign-in dialog that follows `accounts/sign-in` while it is open, so closing it stops the sign-in. It shows the link and code, the latest message, and the open question as an input that shows what is typed, keys too. Enter answers, `ctrl+y` copies the code, else the link, and esc closes. `Done` closes it; a failure stays on screen.

`/disconnect` (category Model) opens a picker of the connected logins under their vendors (`accounts/connected`). Enter asks in the footer, then logs out of the login's provider. A failed logout still removes the login and shows its message in a dialog.

The entry requires `Host`, `Keymap`, `Dialogs` and `Pickers`.

## Add a login

```ts
const methods = yield* LoginMethods;

yield* methods.add(apiKeyMethod("acme", "Acme"));

const browser = Effect.gen(function* () {
  const flow = yield* LoginFlow;
  const authorized = yield* flow.authorizeInBrowser({
    authorizeUrl: "https://acme.example/oauth/authorize",
    params: { client_id: "…", scope: "…" },
    callback: { host: "localhost", port: 1234, path: "/callback" },
  });

  return yield* exchangeForTokens(authorized); // an OAuth credential
});

yield* methods.add({
  id: "acme/plan",
  provider: "acme",
  vendor: "Acme",
  title: "Acme plan",
  credential: "oauth",
  ways: [{ id: "browser", title: "In the browser", run: browser }],
});
```

`requestTokens(client, request, extraOf?)` sends a request to an OAuth token endpoint and gives the `OAuth` credential it issued; `extraOf` reads the extras from the reply, which also holds `id_token` and `scope` when the endpoint sends them. An error status or a reply without tokens fails with `TokensRefused`.

A provider reads its credential with `Credentials.get`, or `Credentials.fresh` for OAuth tokens, and falls back to its environment variable when none is saved. `apiKeyLogin(credentials, provider, variable)` does this for an API key. Its `key` gives the saved key or command output, else the variable's key, else fails with `CredentialsFailed` saying to run `liminal connect` or set the variable. Its `signedIn` is true when something is saved or the variable is set, and never runs a command.
