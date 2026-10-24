/** Saved credentials, the login methods providers add, and the sign-in that screens show. */
import {
  type Array,
  Clock,
  Config,
  Context,
  Effect,
  Option,
  Predicate,
  Redacted,
  Schema,
} from "effect";
import { type HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http";
import { Rpc, RpcGroup } from "effect/rpc";

import { Registry } from "@shanepadgett/liminal-core";

const Secret = Schema.Redacted(Schema.String);

export const ApiKey = Schema.TaggedStruct("ApiKey", { key: Secret });
export type ApiKey = typeof ApiKey.Type;

export const OAuth = Schema.TaggedStruct("OAuth", {
  access: Secret,
  refresh: Secret,
  /** When the access token expires, in epoch milliseconds. */
  expiresAt: Schema.Finite,
  /** What the provider keeps beside the tokens, such as an account id. */
  extra: Schema.Record(Schema.String, Schema.String),
});

export type OAuth = typeof OAuth.Type;

/** A shell command whose output is the API key, such as `op read op://Private/OpenAI/key`. */
export const Command = Schema.TaggedStruct("Command", { command: Schema.String });
export type Command = typeof Command.Type;

export const Credential = Schema.Union([ApiKey, OAuth, Command]);
export type Credential = typeof Credential.Type;

/** What a login saves: an API key, or a command that prints one, else OAuth tokens. */
export type CredentialKind = "key" | "oauth";

export const kindOf = (credential: Credential): CredentialKind =>
  Predicate.isTagged(credential, "OAuth") ? "oauth" : "key";

export class CredentialsFailed extends Schema.TaggedError<
  CredentialsFailed,
  { readonly brand: unique symbol }
>()("CredentialsFailed", { provider: Schema.String, message: Schema.String }) {}

/** One credential per provider id, kept in `liminal.db`. */
export class Credentials extends Context.Service<
  Credentials,
  {
    readonly get: (provider: string) => Effect.Effect<Option.Option<Credential>, CredentialsFailed>;
    readonly set: (
      provider: string,
      credential: Credential,
    ) => Effect.Effect<void, CredentialsFailed>;
    readonly remove: (provider: string) => Effect.Effect<void, CredentialsFailed>;
    /**
     * The API key saved under `provider`: a saved key, or the output of a saved command, which runs
     * once per process. None when nothing or OAuth tokens are saved.
     */
    readonly key: (
      provider: string,
    ) => Effect.Effect<Option.Option<Redacted.Redacted>, CredentialsFailed>;
    /**
     * The provider's OAuth tokens. Within a minute of expiry, `refresh` replaces them inside one
     * write, so one process refreshes and the others read its tokens.
     */
    readonly fresh: <E>(
      provider: string,
      refresh: (stale: OAuth) => Effect.Effect<OAuth, E>,
    ) => Effect.Effect<OAuth, CredentialsFailed | E>;
  }
>()("accounts/Credentials") {}

export class LoginFailed extends Schema.TaggedError<
  LoginFailed,
  { readonly brand: unique symbol }
>()("LoginFailed", { method: Schema.String, message: Schema.String }) {}

export class LogoutFailed extends Schema.TaggedError<
  LogoutFailed,
  { readonly brand: unique symbol }
>()("LogoutFailed", { provider: Schema.String, message: Schema.String }) {}

/** A sign-in through the browser with PKCE. */
export interface BrowserAuthorization {
  readonly authorizeUrl: string;
  /** Query parameters beside the challenge, state and redirect address the sign-in adds. */
  readonly params: Readonly<Record<string, string>>;
  /** The local address the browser returns to; the host is the one the provider expects. */
  readonly callback: { readonly host: string; readonly port: number; readonly path: string };
}

/** What a browser sign-in gives back to exchange for tokens. */
export interface Authorized {
  readonly code: string;
  readonly state: string;
  readonly verifier: string;
  readonly redirectUri: string;
  /** The `client_id` the reply names, which a first sign-in that registers a client is issued. */
  readonly clientId: string | undefined;
}

/** The actions a login method runs; each one reaches the screen as a step. */
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
     * Opens the authorize page and waits for the browser to come back to a local server, or for the
     * user to paste the address it ends on.
     */
    readonly authorizeInBrowser: (
      authorization: BrowserAuthorization,
    ) => Effect.Effect<Authorized, LoginFailed>;
  }
>()("accounts/LoginFlow") {}

/** One way through a login, such as the browser or a code entered on another device. */
export interface LoginWay {
  /** Unique within its login, such as `browser`. */
  readonly id: string;
  readonly title: string;
  readonly run: Effect.Effect<Credential, LoginFailed, LoginFlow>;
}

/** One login to a provider; the credential any of its ways gives is saved under the provider. */
export interface LoginMethod {
  /** Unique across providers, such as `anthropic/subscription`. */
  readonly id: string;
  readonly provider: string;
  /** The company menus group logins under, such as `OpenAI`. */
  readonly vendor: string;
  readonly title: string;
  /** What every way through it saves; the login is connected while that kind is saved. */
  readonly credential: CredentialKind;
  readonly ways: Array.NonEmptyReadonlyArray<LoginWay>;
  /**
   * Ends the login on the provider's side before the credential is removed, such as revoking a
   * refresh token. It gets whatever is saved under the provider, so it checks the kind.
   */
  readonly logOut?: (saved: Credential) => Effect.Effect<void, LogoutFailed>;
}

/** The login methods by id; of two with one id, the one added last is used. */
export class LoginMethods extends Registry.Service<LoginMethods, LoginMethod>()(
  "accounts/LoginMethods",
) {}

/** The trimmed answer; an empty one fails `method` with `nothing`. */
const entered = (method: string, answer: string, nothing: string) => {
  const text = answer.trim();

  return text === ""
    ? Effect.fail(new LoginFailed({ method, message: nothing }))
    : Effect.succeed(text);
};

/** A login that asks for the provider's API key, or for a command that prints it. */
export const apiKeyMethod = (provider: string, vendor: string): LoginMethod => {
  const id = `${provider}/api-key`;

  const key = Effect.gen(function* () {
    const answer = Redacted.value(yield* (yield* LoginFlow).askSecret("API key"));

    return ApiKey.make({ key: Redacted.make(yield* entered(id, answer, "No key was entered.")) });
  });

  const command = Effect.gen(function* () {
    const answer = yield* (yield* LoginFlow).ask("Command that prints the key");

    return Command.make({ command: yield* entered(id, answer, "No command was entered.") });
  });

  return {
    id,
    provider,
    vendor,
    title: "API key",
    credential: "key",
    ways: [
      { id: "key", title: "API key", run: key },
      { id: "command", title: "Command that prints the key", run: command },
    ],
  };
};

/** The kind saved under `provider`, if any; a failing store is logged and counts as none. */
export const savedKind = (
  credentials: Credentials["Service"],
  provider: string,
): Effect.Effect<Option.Option<CredentialKind>> =>
  credentials.get(provider).pipe(
    Effect.map(Option.map(kindOf)),
    Effect.catchTag("CredentialsFailed", (error) =>
      Effect.as(Effect.logWarning(error.message), Option.none()),
    ),
  );

/** Whether a credential is saved under `provider`; a failing store is logged and counts as no. */
export const credentialSaved = (
  credentials: Credentials["Service"],
  provider: string,
): Effect.Effect<boolean> => Effect.map(savedKind(credentials, provider), Option.isSome);

/** How a provider with an API key login reads it. */
export interface ApiKeyLogin {
  /** Whether a credential is saved or the variable is set; never runs a key command. */
  readonly signedIn: Effect.Effect<boolean>;
  /** The saved key or command's output, else the variable's key; failing says how to sign in. */
  readonly key: Effect.Effect<Redacted.Redacted, CredentialsFailed>;
}

/** The API key login saved under `provider`, with the environment variable `variable` as fallback. */
export const apiKeyLogin = (
  credentials: Credentials["Service"],
  provider: string,
  variable: string,
): ApiKeyLogin => {
  const fromEnvironment = Effect.orDie(Config.option(Config.Redacted(variable)));

  const signedIn = Effect.flatMap(credentialSaved(credentials, provider), (saved) =>
    saved ? Effect.succeed(true) : Effect.map(fromEnvironment, Option.isSome),
  );

  const key = Effect.gen(function* () {
    const saved = yield* credentials.key(provider);
    if (Option.isSome(saved)) return saved.value;

    const environment = yield* fromEnvironment;
    if (Option.isSome(environment)) return environment.value;

    return yield* new CredentialsFailed({
      provider,
      message: `Run liminal connect, or set ${variable}.`,
    });
  });

  return { signedIn, key };
};

/** An OAuth token endpoint refused a request, or did not reply with tokens. */
export class TokensRefused extends Schema.TaggedError<
  TokensRefused,
  { readonly brand: unique symbol }
>()("TokensRefused", { message: Schema.String }) {}

const TokenReply = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_in: Schema.Finite,
  id_token: Schema.optionalKey(Schema.String),
  /** The scopes granted, separated by spaces. */
  scope: Schema.optionalKey(Schema.String),
});

export type TokenReply = typeof TokenReply.Type;

const refused = (error: { readonly message: string }) =>
  new TokensRefused({ message: error.message });

/**
 * Sends `request` to an OAuth token endpoint and gives the tokens it issued. `extraOf` reads what
 * the provider keeps beside them, such as an account id.
 */
export const requestTokens = <E = never>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  extraOf: (reply: TokenReply) => Effect.Effect<OAuth["extra"], E> = () => Effect.succeed({}),
) =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(Effect.mapError(refused));

    if (response.status >= 400) {
      const text = yield* response.text.pipe(Effect.orElseSucceed(() => ""));

      return yield* new TokensRefused({ message: `${response.status} ${text}` });
    }

    const reply = yield* HttpClientResponse.schemaBodyJson(TokenReply)(response).pipe(
      Effect.mapError(refused),
    );

    const extra = yield* extraOf(reply);
    const now = yield* Clock.currentTimeMillis;

    return OAuth.make({
      access: Redacted.make(reply.access_token),
      refresh: Redacted.make(reply.refresh_token),
      expiresAt: now + reply.expires_in * 1000,
      extra,
    });
  });

export const OpenUrl = Schema.TaggedStruct("OpenUrl", { url: Schema.String });

export const ShowCode = Schema.TaggedStruct("ShowCode", {
  code: Schema.String,
  url: Schema.String,
});

export const Ask = Schema.TaggedStruct("Ask", { question: Schema.String, secret: Schema.Boolean });
export const Waiting = Schema.TaggedStruct("Waiting", { text: Schema.String });
export const Told = Schema.TaggedStruct("Told", { text: Schema.String });
export const Done = Schema.TaggedStruct("Done", {});

/** What the screen shows; an `Ask` waits for `accounts/answer`, and a later step withdraws it. */
export const LoginStep = Schema.Union([OpenUrl, ShowCode, Ask, Waiting, Told, Done]);
export type LoginStep = typeof LoginStep.Type;

const LoginWayInfo = Schema.Struct({ id: Schema.String, title: Schema.String });

export const LoginMethodInfo = Schema.Struct({
  id: Schema.String,
  provider: Schema.String,
  vendor: Schema.String,
  title: Schema.String,
  ways: Schema.Array(LoginWayInfo),
  /** Whether the kind of credential the method saves is saved under its provider. */
  connected: Schema.Boolean,
});

/** What screens call. */
export class AccountsRpc extends RpcGroup.make(
  Rpc.make("accounts/methods", { success: Schema.Array(LoginMethodInfo) }),
  Rpc.make("accounts/sign-in", {
    payload: { method: Schema.String, way: Schema.String },
    success: LoginStep,
    error: LoginFailed,
    stream: true,
  }),
  Rpc.make("accounts/answer", {
    payload: { method: Schema.String, text: Secret },
    error: LoginFailed,
  }),
  Rpc.make("accounts/logout", { payload: { provider: Schema.String }, error: LogoutFailed }),
) {}
