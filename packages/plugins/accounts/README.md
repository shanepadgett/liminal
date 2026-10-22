# @shanepadgett/liminal-accounts

Saved credentials and the logins that create them.

- `Credentials`: one credential per provider in `liminal.db`. A credential is an API key or OAuth tokens (access, refresh, expiry and provider extras such as an account id). `fresh` gives OAuth tokens, refreshing them within a minute of expiry inside one write, so one process refreshes.
- `LoginMethods`: the registry providers add their logins to. A method runs against `LoginFlow`: open a URL, show a code, ask, ask for a secret, show waiting, tell, and sign in through the browser.
- `authorizeInBrowser` signs in with PKCE. The browser comes back to a local server, or the user pastes the address it ends on. When the port is taken, only the pasted address works.
- `AccountsRpc`: `accounts/methods`, `accounts/sign-in` (a stream of steps for the screen) and `accounts/answer` (what the user types for an `Ask` step). `liminal connect` shows them.

Requires `SqlClient` and `Crypto`.

## Add a login

```ts
const methods = yield* LoginMethods;

yield* methods.add(apiKeyMethod("acme"));

yield* methods.add({
  id: "acme/plan",
  provider: "acme",
  title: "Acme plan",
  run: Effect.gen(function* () {
    const flow = yield* LoginFlow;
    const authorized = yield* flow.authorizeInBrowser({
      authorizeUrl: "https://acme.example/oauth/authorize",
      params: { client_id: "…", scope: "…" },
      callback: { host: "localhost", port: 1234, path: "/callback" },
    });

    return yield* exchangeForTokens(authorized); // an OAuth credential
  }),
});
```

A provider reads its credential with `Credentials.get`, or `Credentials.fresh` for OAuth tokens, and falls back to its environment variable when none is saved.
