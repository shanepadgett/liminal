/**
 * Checks the ID token a Sign in with ChatGPT login is issued: its RS256 signature against OpenAI's
 * published keys, then its issuer, audience, expiry and nonce.
 */

import { Clock, Effect, Result, Schema } from "effect";
import { Base64Url } from "effect/encoding";
import { type HttpClient, HttpClientResponse } from "effect/http";

import { LoginFailed } from "@liminal/logins/contract";

import { chatgptLogin } from "../../contract.ts";
import { issuer } from "./auth.ts";

const jwksUrl = `${issuer}/.well-known/jwks.json`;
const signatureAlgorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

const fromBase64UrlJson = <S extends Schema.Top>(schema: S) =>
  Schema.StringFromBase64Url.pipe(Schema.decodeTo(Schema.fromJsonString(schema)));

const Header = fromBase64UrlJson(
  Schema.Struct({ alg: Schema.Literal("RS256"), kid: Schema.String }),
);

const Claims = fromBase64UrlJson(
  Schema.Struct({
    iss: Schema.String,
    aud: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
    exp: Schema.Finite,
    nonce: Schema.optionalKey(Schema.String),
  }),
);

/** An RSA public key as JWKS publishes it, where the modulus and exponent are `n` and `e`. */
const RsaKey = Schema.Struct({
  kid: Schema.String,
  kty: Schema.Literal("RSA"),
  modulus: Schema.String,
  exponent: Schema.String,
}).pipe(Schema.encodeKeys({ modulus: "n", exponent: "e" }));

const SigningKeys = Schema.Struct({ keys: Schema.Array(RsaKey) });

const untrusted = (why: string) =>
  new LoginFailed({
    method: chatgptLogin,
    message: `OpenAI sent an ID token Liminal cannot trust: ${why}`,
  });

/** Whether `key` signed `signed` with `signature`. */
const isSignedBy = (
  key: typeof RsaKey.Type,
  signed: Uint8Array<ArrayBuffer>,
  signature: Uint8Array<ArrayBuffer>,
) =>
  Schema.encodeEffect(RsaKey)(key).pipe(
    Effect.flatMap((jwk) =>
      Effect.tryPromise(async () => {
        const publicKey = await crypto.subtle.importKey("jwk", jwk, signatureAlgorithm, false, [
          "verify",
        ]);

        return await crypto.subtle.verify(signatureAlgorithm, publicKey, signature, signed);
      }),
    ),
    Effect.mapError(() => untrusted("OpenAI published a signing key Liminal cannot use")),
  );

/** The published key `kid` names. */
const keyOf = (client: HttpClient.HttpClient, kid: string) =>
  client.get(jwksUrl).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(SigningKeys)),
    Effect.mapError((cause) => untrusted(`its signing keys could not be read: ${cause.message}`)),
    Effect.flatMap((published) => {
      const key = published.keys.find((candidate) => candidate.kid === kid);

      return key === undefined
        ? Effect.fail(untrusted("no published key signed it"))
        : Effect.succeed(key);
    }),
  );

/** Checks that the token is OpenAI's, for `clientId`, current, and this login's. */
const checkClaims = Effect.fn("checkClaims")(function* (
  claims: typeof Claims.Type,
  clientId: string,
  nonce: string,
) {
  if (claims.iss !== issuer) return yield* untrusted(`it was issued by ${claims.iss}`);

  const audience = Schema.is(Schema.String)(claims.aud) ? [claims.aud] : claims.aud;
  if (!audience.includes(clientId)) return yield* untrusted("it is for another app");

  const now = yield* Clock.currentTimeMillis;
  if (claims.exp * 1000 <= now) return yield* untrusted("it has expired");

  return yield* claims.nonce === nonce
    ? Effect.void
    : Effect.fail(untrusted("it belongs to another login"));
});

/**
 * Checks the signature of `idToken`, then that it is OpenAI's, for `clientId`, current, and this
 * login's.
 */
export const verifyIdToken = Effect.fn("verifyIdToken")(function* (
  client: HttpClient.HttpClient,
  idToken: string,
  clientId: string,
  nonce: string,
) {
  const [encodedHeader = "", encodedClaims = "", encodedSignature = ""] = idToken.split(".");

  const decoded = yield* Effect.all([
    Schema.decodeEffect(Header)(encodedHeader),
    Schema.decodeEffect(Claims)(encodedClaims),
  ]).pipe(Effect.mapError(() => untrusted("it is not a readable JWT")));

  const [header, claims] = decoded;
  const signature = Base64Url.decode(encodedSignature);
  if (Result.isFailure(signature)) return yield* untrusted("its signature is unreadable");

  const key = yield* keyOf(client, header.kid);
  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`);
  const isSigned = yield* isSignedBy(key, signed, new Uint8Array(signature.success));
  if (!isSigned) return yield* untrusted("its signature does not match");

  return yield* checkClaims(claims, clientId, nonce);
});
