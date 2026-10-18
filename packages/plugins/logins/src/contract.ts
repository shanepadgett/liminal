/**
 * Logins: the ways to sign in to each provider, run one at a time on the server, and the RPCs the
 * `/connect` dialog drives them with.
 */

import { Context, Data, type Effect, type Option, type Redacted, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import type { Credential } from "@liminal/credential-store/contract";
import { KeyedRegistry } from "@liminal/sdk";

/** The company a login signs in to, such as OpenAI. */
export const Vendor = Schema.Struct({ id: Schema.String, name: Schema.String });

export type Vendor = typeof Vendor.Type;

/** How a login method can finish, such as in the browser or by a device code. */
export const LoginWay = Schema.Struct({ id: Schema.String, title: Schema.String });

export type LoginWay = typeof LoginWay.Type;

/** A login failed or could not be saved, removed or read. */
export class LoginFailed extends Schema.TaggedError<
  LoginFailed,
  { readonly brand: unique symbol }
>()("LoginFailed", { method: Schema.String, message: Schema.String }) {}

/**
 * Where the browser comes back to after sign-in. `Callback` is a local server, with a pasted
 * address as fallback; port 0 takes a free port. `Page` is the provider's page that shows
 * `code#state` to paste.
 */
export type LoginReturn = Data.TaggedEnum<{
  Callback: { readonly host: string; readonly port: number; readonly path: string };
  Page: { readonly redirectUri: string };
}>;

export const LoginReturn = Data.taggedEnum<LoginReturn>();

/** A provider's authorize page; `params` holds its client id, scope and its own extras. */
export interface BrowserAuthorization {
  readonly authorizeUrl: string;
  readonly params: Readonly<Record<string, string>>;
  readonly returnTo: LoginReturn;
}

/** The code the browser came back with, and what exchanging it for tokens needs. */
export interface Authorized {
  readonly code: string;
  readonly verifier: string;
  readonly redirectUri: string;
  readonly state: string;
  /** The client id the reply named, which a provider that registers the app on sign-in issues. */
  readonly clientId: Option.Option<string>;
}

/** What a login flow shows the user and asks of them while it runs. */
export class LoginFlow extends Context.Service<
  LoginFlow,
  {
    readonly openUrl: (url: string) => Effect.Effect<void>;
    readonly showCode: (code: string, url: string) => Effect.Effect<void>;
    readonly ask: (question: string) => Effect.Effect<string>;
    readonly askSecret: (question: string) => Effect.Effect<Redacted.Redacted>;
    readonly waiting: (text: string) => Effect.Effect<void>;
    readonly tell: (text: string) => Effect.Effect<void>;
    /**
     * Signs in in the browser with PKCE: opens the authorize page and waits for the browser to come
     * back to `callback`, or for the user to paste the address it ended on.
     */
    readonly authorizeInBrowser: (
      authorization: BrowserAuthorization,
    ) => Effect.Effect<Authorized, LoginFailed>;
  }
>()("liminal/logins/LoginFlow") {}

/**
 * A way to sign in; `id` is the credential-store method that holds its credential. `ApiKey` is
 * handled by logins: it asks for the key, saves it, and reads environment variable `env` while none
 * is saved. `Flow` runs the provider's own login and logins saves the credential it returns.
 */
export type LoginMethod = Data.TaggedEnum<{
  ApiKey: {
    readonly id: string;
    readonly vendor: Vendor;
    readonly title: string;
    readonly env: string;
  };
  Flow: {
    readonly id: string;
    readonly vendor: Vendor;
    readonly title: string;
    readonly ways: ReadonlyArray<LoginWay>;
    readonly logIn: (way: string) => Effect.Effect<Credential, LoginFailed, LoginFlow>;
    /** Runs before logins removes the saved credential, such as to revoke it. */
    readonly logOut: Option.Option<Effect.Effect<void, LoginFailed>>;
  };
}>;

export const LoginMethod = Data.taggedEnum<LoginMethod>();

/** The login methods by id; each provider plugin registers its own in its server's scope. */
export class LoginMethods extends KeyedRegistry.Service<LoginMethods, LoginMethod>()(
  "liminal/logins/LoginMethods",
) {}

export const SignedOut = Schema.TaggedStruct("SignedOut", {});

export const Saved = Schema.TaggedStruct("Saved", {});

export const FromEnv = Schema.TaggedStruct("FromEnv", { variable: Schema.String });

/** Signed out, signed in by a saved credential, or by a key in environment variable `variable`. */
export const SignIn = Schema.Union([SignedOut, Saved, FromEnv]);

export type SignIn = typeof SignIn.Type;

/** A login method as `/connect` lists it. */
export const MethodInfo = Schema.Struct({
  id: Schema.String,
  vendor: Vendor,
  title: Schema.String,
  ways: Schema.Array(LoginWay),
  state: SignIn,
});

export type MethodInfo = typeof MethodInfo.Type;

export const OpenUrl = Schema.TaggedStruct("OpenUrl", { url: Schema.String });

export const ShowCode = Schema.TaggedStruct("ShowCode", {
  code: Schema.String,
  url: Schema.String,
});

/** A question; the answer comes back through `logins/answer`. */
export const Ask = Schema.TaggedStruct("Ask", {
  question: Schema.String,
  isSecret: Schema.Boolean,
});

export const Waiting = Schema.TaggedStruct("Waiting", { text: Schema.String });

export const Told = Schema.TaggedStruct("Told", { text: Schema.String });

export const Done = Schema.TaggedStruct("Done", {});

/** The step a running login is on; it ends with `Done` or a `LoginFailed`. */
export const LoginStep = Schema.Union([OpenUrl, ShowCode, Ask, Waiting, Told, Done]);

export type LoginStep = typeof LoginStep.Type;

/**
 * Logins' commands for frontends. `logins/start` runs a login and streams its steps; closing the
 * stream stops it. `logins/answer` answers the question it is waiting on.
 */
export class LoginsRpcs extends RpcGroup.make(
  Rpc.make("logins/list", { success: Schema.Array(MethodInfo), error: LoginFailed }),
  Rpc.make("logins/start", {
    payload: { method: Schema.String, way: Schema.optionalKey(Schema.String) },
    success: LoginStep,
    error: LoginFailed,
    stream: true,
  }),
  Rpc.make("logins/answer", {
    payload: { method: Schema.String, text: Schema.String },
    error: LoginFailed,
  }),
  Rpc.make("logins/logout", { payload: { method: Schema.String }, error: LoginFailed }),
) {}
