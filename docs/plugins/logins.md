# logins

The login methods provider plugins register, their flows, and `/connect`.

Status: built

## Provides

- `LoginMethods` registry that provider plugins add to
- `LoginFlow` service a `Flow` login runs against: `openUrl`, `showCode`, `ask`, `askSecret`, `waiting`, `tell`, `authorizeInBrowser`
- `RpcGroup` with `logins/list`, `logins/start`, `logins/answer`, `logins/logout`

## Requires

- `CredentialStore`

## Adds

- TUI part: `/connect` (command `logins.connect`)

## Requirements

### Methods

- A login method's id is the credential-store method holding its credential
- `ApiKey { env }`: logins asks for the key, saves it, and reads environment variable `env` while none is saved
- `Flow { ways, logIn, logOut }`: the provider's own login returns its credential and logins saves it; `logOut` runs before the credential is removed
- Each method shows one state: signed out, saved, or from an environment variable

### Flows

- A login runs on the server; its steps stream over `logins/start`: open a URL, show a code, ask, waiting, told, done
- `logins/answer` answers the question the login waits on
- Closing the `logins/start` stream stops the login
- An empty API key fails the login and saves nothing

### Browser sign-in

- `authorizeInBrowser` runs PKCE (S256) with a random state, opens the authorize page and returns the code, verifier, redirect address and state; the provider exchanges the code itself
- The browser returns to a local callback (`LoginReturn.Callback`) or to a page that shows `code#state` to paste (`LoginReturn.Page`)
- A local server on the callback host, port and path takes the browser's reply and closes when the sign-in ends
- The browser opens with `open` on macOS and `xdg-open` elsewhere; the link is shown too
- A pasted address the browser ends on completes the sign-in as well; a taken port leaves only the paste
- A reply with an error, another login's state or no code fails the login

### /connect

- Providers list titled "Connect a provider", sorted by vendor, "signed in" when any method is
- Enter opens the vendor's methods with their state; a vendor with one method skips the list
- A method with several ways lists them; one way skips the list
- The login dialog draws each step; a question is a text or secret field; a failure shows its message, enter retries
- A finished login closes every `/connect` dialog
- Ctrl+d on a saved method asks, then signs it out; a key from the environment cannot be signed out here
- Esc goes back one dialog

## References

- Tau `src/ai/Login.ts`, `src/ai/Connections.ts`, `src/tui/internal/{ConnectDialog.tsx,connect-state.ts,connect-flow.ts}`
