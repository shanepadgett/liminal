/**
 * A fake OpenAI for Sign in with ChatGPT: the token, JWKS and revoke endpoints of its auth server
 * with a real RSA key, and the API's model list and Responses stream, over a stub HTTP client.
 */

import { Effect, Predicate, Ref, Schema } from "effect";
import { Base64Url } from "effect/encoding";
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http";

import { replyStream } from "./support.ts";

/** One request as sent: its path, headers and form fields. */
export interface Sent {
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly form: Readonly<Record<string, string>>;
}

/** How the fake answers; `claims` gives the ID token's claims for the login's nonce. */
export interface Answers {
  readonly scope: string;
  readonly claims: (nonce: string) => Readonly<Record<string, Schema.Json>>;
  readonly revokeStatus: number;
}

const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

const encodeJson = (value: Schema.Json) =>
  Base64Url.encode(new TextEncoder().encode(JSON.stringify(value)));

/** An RSA key pair, with the public half as JWKS publishes it under kid `k1`. */
export const makeKey = Effect.promise(async () => {
  const pair = await crypto.subtle.generateKey(
    { ...algorithm, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["sign", "verify"],
  );

  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);

  return { privateKey: pair.privateKey, jwk: { kid: "k1", kty: "RSA", n: jwk.n, e: jwk.e } };
});

type Key = Effect.Success<typeof makeKey>;

/** The key ID tokens are signed with, and the one JWKS publishes; they differ to fake a forgery. */
export interface Keys {
  readonly signing: Key;
  readonly published: Key;
}

/** A JWT with `claims`, signed by `key`. */
export const signToken = (key: Key, claims: Readonly<Record<string, Schema.Json>>) =>
  Effect.promise(async () => {
    const signed = `${encodeJson({ alg: "RS256", kid: "k1" })}.${encodeJson(claims)}`;

    const signature = await crypto.subtle.sign(
      algorithm,
      key.privateKey,
      new TextEncoder().encode(signed),
    );

    return `${signed}.${Base64Url.encode(new Uint8Array(signature))}`;
  });

const formOf = (request: HttpClientRequest.HttpClientRequest) =>
  Predicate.isTagged(request.body, "Uint8Array")
    ? Object.fromEntries(new URLSearchParams(new TextDecoder().decode(request.body.body)))
    : {};

const nonceOf = (sent: Ref.Ref<ReadonlyArray<string>>) =>
  Effect.map(Ref.get(sent), (nonces) => nonces.at(-1) ?? "");

/** The response for `path`; the token endpoint signs an ID token for the latest nonce. */
const answer = Effect.fn("answer")(function* (
  path: string,
  keys: Keys,
  answers: Answers,
  nonces: Ref.Ref<ReadonlyArray<string>>,
) {
  if (path === "/.well-known/jwks.json") return Response.json({ keys: [keys.published.jwk] });

  if (path === "/api/accounts/oauth/revoke")
    return new Response("", { status: answers.revokeStatus });

  if (path === "/v1/responses")
    return new Response(replyStream, { headers: { "content-type": "text/event-stream" } });

  if (path === "/v1/models")
    return Response.json({
      models: [
        { slug: "gpt-test", context_window: 272_000, visibility: "list" },
        { slug: "gpt-review", context_window: 272_000, visibility: "hide" },
      ],
    });

  const idToken = yield* signToken(keys.signing, answers.claims(yield* nonceOf(nonces)));

  return Response.json({
    access_token: "at-1",
    refresh_token: "rt-1",
    expires_in: 3600,
    id_token: idToken,
    scope: answers.scope,
  });
});

/** The fake over `keys`; `nonces` holds each login's nonce, as the fake flow records it. */
export const fakeOpenAi = (
  keys: Keys,
  answers: Answers,
  nonces: Ref.Ref<ReadonlyArray<string>>,
  sent: Ref.Ref<ReadonlyArray<Sent>>,
) =>
  HttpClient.make((request) => {
    const url = new URL(request.url);

    return Ref.update(sent, (all) => [
      ...all,
      { path: url.pathname, headers: request.headers, form: formOf(request) },
    ]).pipe(
      Effect.andThen(answer(url.pathname, keys, answers, nonces)),
      Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
    );
  });

/** Claims OpenAI would issue for app `clientId` and `nonce`, valid for an hour after `now`. */
export const goodClaims =
  (clientId: string, now: number) =>
  (nonce: string): Readonly<Record<string, Schema.Json>> => ({
    iss: "https://auth.openai.com",
    aud: [clientId],
    exp: Math.floor(now / 1000) + 3600,
    nonce,
  });
