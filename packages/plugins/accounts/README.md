# @shanepadgett/liminal-accounts

Saved credentials and the logins that create them.

- `Credentials`: one credential per provider in `liminal.db`. A credential is an API key or OAuth tokens (access, refresh, expiry and provider extras such as an account id). `fresh` gives OAuth tokens, refreshing them within a minute of expiry inside one write, so one process refreshes.
- `LoginMethods`: the registry providers add their logins to. A login names the provider its credential is saved under, the vendor menus group it under, such as `OpenAI`, and one or more ways through it, such as the browser or a device code. A way runs against `LoginFlow`: open a URL, show a code, ask, ask for a secret, show waiting, tell, and sign in through the browser.
- `authorizeInBrowser` signs in with PKCE. The browser comes back to a local server, or the user pastes the address it ends on. When the port is taken, only the pasted address works. It gives the code, the verifier, and the `client_id` the reply names, which a login that registers a client on first sign-in needs.
- `AccountsRpc`: `accounts/methods`, `accounts/sign-in` of a login and way (a stream of steps for the screen) and `accounts/answer` (what the user types for an `Ask` step). `liminal connect` asks for the vendor, the login and the way, skipping a choice of one.

Requires `SqlClient` and `Crypto`.

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
  ways: [{ id: "browser", title: "In the browser", run: browser }],
});
```

`requestTokens(client, request, extraOf?)` sends a request to an OAuth token endpoint and gives the `OAuth` credential it issued; `extraOf` reads the extras from the reply, which also holds `id_token` and `scope` when the endpoint sends them. An error status or a reply without tokens fails with `TokensRefused`.

A provider reads its credential with `Credentials.get`, or `Credentials.fresh` for OAuth tokens, and falls back to its environment variable when none is saved.
