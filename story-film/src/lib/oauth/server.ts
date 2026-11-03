import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { oauthClient, oauthGrant, oauthToken } from "@/lib/db/schema";
import { type FetchClientDocument, fetchClientDocument, isClientDocumentUrl, validRedirectUri } from "./client-document";

export { validRedirectUri };

// OAuth 2.1 authorization server for the connector, following the MCP authorization spec
// (2026-07-28): PKCE with S256 only, exact redirect URIs, dynamic client registration and
// client ID metadata documents, rotated refresh tokens, and tokens bound to the MCP endpoint.
// Sign-in itself is Reelkar's own (better-auth); this only issues codes and tokens.

export const SCOPE = "reels";
export const CODE_TTL_SEC = 60;
export const ACCESS_TTL_SEC = 3600;
export const REFRESH_TTL_SEC = 30 * 86400;
const ACCESS_PREFIX = "rkat_";
const REFRESH_PREFIX = "rkrt_";
const MAX_REDIRECT_URIS = 10;

export const hashSecret = (s: string) => createHash("sha256").update(s).digest("hex");
const random = (prefix = "") => prefix + randomBytes(32).toString("base64url");
const sameHash = (a: string, b: string) => timingSafeEqual(Buffer.from(a), Buffer.from(b));

export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly description: string,
    readonly status = 400,
  ) {
    super(description);
  }
  body() {
    return { error: this.error, error_description: this.description };
  }
}

// The issuer is the public origin; the protected resource is the MCP endpoint on it.
export const resourceFor = (issuer: string) => `${issuer}/api/mcp`;
export const resourceMetadataUrl = (issuer: string) => `${issuer}/.well-known/oauth-protected-resource/api/mcp`;

export function protectedResourceMetadata(issuer: string) {
  return {
    resource: resourceFor(issuer),
    authorization_servers: [issuer],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Reelkar",
  };
}

export function authorizationServerMetadata(issuer: string) {
  const authMethods = ["none", "client_secret_basic", "client_secret_post"];
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    scopes_supported: [SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: authMethods,
    revocation_endpoint_auth_methods_supported: authMethods,
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

// The 401 challenge from /api/mcp, pointing assistants at the metadata (RFC 9728 §5.1).
export function wwwAuthenticate(issuer: string, invalidToken: boolean) {
  const error = invalidToken ? `error="invalid_token", error_description="The access token is missing, expired or revoked", ` : "";
  return `Bearer ${error}resource_metadata="${resourceMetadataUrl(issuer)}", scope="${SCOPE}"`;
}

export interface Client {
  id: string;
  name: string;
  redirectUris: string[];
  secretHash: string | null;
}

// ---------- Registration (RFC 7591) ----------

export async function registerClient(db: Db, body: unknown) {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS || !uris.every(validRedirectUri)) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris must be 1 to 10 https (or http://localhost) addresses without a fragment.");
  }
  const method = b.token_endpoint_auth_method ?? "none";
  if (!["none", "client_secret_basic", "client_secret_post"].includes(method as string)) {
    throw new OAuthError("invalid_client_metadata", "token_endpoint_auth_method must be none, client_secret_basic or client_secret_post.");
  }
  const grantTypes = (b.grant_types ?? ["authorization_code", "refresh_token"]) as unknown[];
  if (!Array.isArray(grantTypes) || !grantTypes.every((g) => g === "authorization_code" || g === "refresh_token")) {
    throw new OAuthError("invalid_client_metadata", "Only the authorization_code and refresh_token grant types are supported.");
  }
  const responseTypes = (b.response_types ?? ["code"]) as unknown[];
  if (!Array.isArray(responseTypes) || !responseTypes.every((r) => r === "code")) {
    throw new OAuthError("invalid_client_metadata", "Only the code response type is supported.");
  }
  const name = typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim().slice(0, 80) : "An AI assistant";
  const id = random("rkc_");
  const secret = method === "none" ? null : random("rks_");
  const [row] = await db
    .insert(oauthClient)
    .values({ id, name, redirectUris: uris as string[], secretHash: secret ? hashSecret(secret) : null })
    .returning();
  return {
    client_id: id,
    client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_name: name,
    redirect_uris: uris,
    grant_types: grantTypes.length ? grantTypes : ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: method,
  };
}

export async function findClient(db: Db, clientId: string, fetchDoc: FetchClientDocument = fetchClientDocument): Promise<Client | null> {
  if (isClientDocumentUrl(clientId)) {
    const doc = await fetchDoc(clientId).catch(() => null);
    return doc ? { id: clientId, name: doc.clientName, redirectUris: doc.redirectUris, secretHash: null } : null;
  }
  const [row] = await db.select().from(oauthClient).where(eq(oauthClient.id, clientId));
  return row ? { id: row.id, name: row.name, redirectUris: row.redirectUris, secretHash: row.secretHash } : null;
}

// ---------- Authorization ----------

export interface AuthorizationRequest {
  client: Client;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string;
  resource: string;
}

// An authorize error. With a redirect, the client is told (RFC 6749 §4.1.2.1); without one
// (unknown client or redirect URI) Reelkar shows the error itself and never redirects.
export class AuthorizeError extends Error {
  constructor(
    message: string,
    readonly redirect: string | null = null,
  ) {
    super(message);
  }
}

function withParams(uri: string, params: Record<string, string | null>) {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== null) url.searchParams.set(k, v);
  return url.toString();
}

// The resource a token is for: this server's MCP endpoint. The bare origin is accepted too.
function canonicalResource(requested: string | null, issuer: string): string | null {
  const ours = resourceFor(issuer);
  if (!requested) return ours;
  try {
    const url = new URL(requested);
    if (url.hash) return null;
    const normal = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
    return normal === ours || normal === issuer ? ours : null;
  } catch {
    return null;
  }
}

function checkScope(requested: string | null): string | null {
  const scopes = (requested ?? "").split(" ").filter(Boolean);
  // offline_access is harmless to ask for: refresh tokens are always issued.
  const unknown = scopes.filter((s) => s !== SCOPE && s !== "offline_access");
  return unknown.length ? null : SCOPE;
}

export async function parseAuthorization(
  db: Db,
  params: URLSearchParams,
  issuer: string,
  fetchDoc?: FetchClientDocument,
): Promise<AuthorizationRequest> {
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const client = clientId ? await findClient(db, clientId, fetchDoc) : null;
  if (!client) throw new AuthorizeError("This app isn't registered with Reelkar. Go back to the app and try connecting again.");
  // Exact match only. A client with one registered URI may leave redirect_uri out.
  const uri = redirectUri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : null);
  if (!uri || !client.redirectUris.includes(uri)) throw new AuthorizeError("The app's return address doesn't match the one it registered, so Reelkar stopped here.");

  const state = params.get("state");
  const fail = (error: string, description: string) =>
    new AuthorizeError(description, withParams(uri, { error, error_description: description, state, iss: issuer }));
  if (params.get("response_type") !== "code") throw fail("unsupported_response_type", "response_type must be code");
  const challenge = params.get("code_challenge");
  if (!challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw fail("invalid_request", "A PKCE code_challenge is required");
  if (params.get("code_challenge_method") !== "S256") throw fail("invalid_request", "code_challenge_method must be S256");
  const scope = checkScope(params.get("scope"));
  if (!scope) throw fail("invalid_scope", `The only scope is "${SCOPE}"`);
  const resource = canonicalResource(params.get("resource"), issuer);
  if (!resource) throw fail("invalid_target", `resource must be ${resourceFor(issuer)}`);
  return { client, redirectUri: uri, state, codeChallenge: challenge, scope, resource };
}

export const redirectHost = (uri: string) => new URL(uri).host;

export async function approve(db: Db, req: AuthorizationRequest, issuer: string, userId: string, timeZone: string, now = new Date()) {
  const [existing] = await db
    .select()
    .from(oauthGrant)
    .where(and(eq(oauthGrant.userId, userId), eq(oauthGrant.clientId, req.client.id), eq(oauthGrant.resource, req.resource)));
  const grant =
    existing ??
    (
      await db
        .insert(oauthGrant)
        .values({ userId, clientId: req.client.id, clientName: req.client.name, redirectHost: redirectHost(req.redirectUri), scope: req.scope, resource: req.resource, timeZone })
        .returning()
    )[0];
  if (existing) await db.update(oauthGrant).set({ timeZone, clientName: req.client.name }).where(eq(oauthGrant.id, grant.id));
  const code = random();
  await db.insert(oauthToken).values({
    hash: hashSecret(code),
    grantId: grant.id,
    kind: "code",
    redirectUri: req.redirectUri,
    codeChallenge: req.codeChallenge,
    expiresAt: new Date(now.getTime() + CODE_TTL_SEC * 1000),
  });
  return withParams(req.redirectUri, { code, state: req.state, iss: issuer });
}

export const deny = (req: AuthorizationRequest, issuer: string) =>
  withParams(req.redirectUri, { error: "access_denied", error_description: "The creator said no", state: req.state, iss: issuer });

// ---------- Token endpoint ----------

// Client authentication: public clients send client_id; confidential ones a secret too.
async function authenticateClient(db: Db, form: URLSearchParams, authorization: string | null, fetchDoc?: FetchClientDocument): Promise<Client> {
  let clientId = form.get("client_id");
  let secret = form.get("client_secret");
  if (authorization?.startsWith("Basic ")) {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString();
    const i = decoded.indexOf(":");
    if (i > 0) {
      clientId = decodeURIComponent(decoded.slice(0, i));
      secret = decodeURIComponent(decoded.slice(i + 1));
    }
  }
  const client = clientId ? await findClient(db, clientId, fetchDoc) : null;
  if (!client) throw new OAuthError("invalid_client", "Unknown client", 401);
  if (client.secretHash && !(secret && sameHash(hashSecret(secret), client.secretHash))) throw new OAuthError("invalid_client", "Wrong client secret", 401);
  return client;
}

export const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

async function issueTokens(db: Db, grant: typeof oauthGrant.$inferSelect, now: Date) {
  const access = random(ACCESS_PREFIX);
  const refresh = random(REFRESH_PREFIX);
  // Expired rows are no use; used refresh tokens stay until they expire, to catch a stolen one being replayed.
  await db.delete(oauthToken).where(and(eq(oauthToken.grantId, grant.id), lt(oauthToken.expiresAt, now)));
  await db.insert(oauthToken).values([
    { hash: hashSecret(access), grantId: grant.id, kind: "access", expiresAt: new Date(now.getTime() + ACCESS_TTL_SEC * 1000) },
    { hash: hashSecret(refresh), grantId: grant.id, kind: "refresh", expiresAt: new Date(now.getTime() + REFRESH_TTL_SEC * 1000) },
  ]);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SEC, refresh_token: refresh, scope: grant.scope };
}

// Codes and refresh tokens are spent exactly once. A second use means one leaked, so the
// whole grant is revoked (OAuth 2.1 §4.1.3 and §4.3.1).
async function spend(db: Db, hash: string, kind: "code" | "refresh", clientId: string, now: Date) {
  const [row] = await db
    .select({ token: oauthToken, grant: oauthGrant })
    .from(oauthToken)
    .innerJoin(oauthGrant, eq(oauthToken.grantId, oauthGrant.id))
    .where(and(eq(oauthToken.hash, hash), eq(oauthToken.kind, kind)));
  const what = kind === "code" ? "authorization code" : "refresh token";
  if (!row || row.grant.clientId !== clientId) throw new OAuthError("invalid_grant", `Unknown ${what}`);
  const claimed = await db
    .update(oauthToken)
    .set({ usedAt: now })
    .where(and(eq(oauthToken.hash, hash), isNull(oauthToken.usedAt)))
    .returning({ hash: oauthToken.hash });
  if (!claimed.length) {
    await db.delete(oauthGrant).where(eq(oauthGrant.id, row.grant.id));
    throw new OAuthError("invalid_grant", `This ${what} was already used, so the connection was revoked. Connect again.`);
  }
  if (row.token.expiresAt <= now) throw new OAuthError("invalid_grant", `The ${what} has expired`);
  return row;
}

export async function exchangeToken(db: Db, form: URLSearchParams, authorization: string | null, issuer: string, opts: { now?: Date; fetchDoc?: FetchClientDocument } = {}) {
  const now = opts.now ?? new Date();
  const grantType = form.get("grant_type");
  if (grantType !== "authorization_code" && grantType !== "refresh_token") throw new OAuthError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
  const client = await authenticateClient(db, form, authorization, opts.fetchDoc);
  const resource = form.get("resource");
  if (resource && canonicalResource(resource, issuer) === null) throw new OAuthError("invalid_target", `resource must be ${resourceFor(issuer)}`);

  if (grantType === "authorization_code") {
    const code = form.get("code");
    const verifier = form.get("code_verifier");
    if (!code) throw new OAuthError("invalid_request", "code is required");
    if (!verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new OAuthError("invalid_request", "A PKCE code_verifier of 43 to 128 characters is required");
    const { token, grant } = await spend(db, hashSecret(code), "code", client.id, now);
    if (form.get("redirect_uri") && form.get("redirect_uri") !== token.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri doesn't match the authorization request");
    if (!token.codeChallenge || !sameHash(s256(verifier), token.codeChallenge)) throw new OAuthError("invalid_grant", "The PKCE code_verifier doesn't match");
    if (resource && canonicalResource(resource, issuer) !== grant.resource) throw new OAuthError("invalid_target", "resource doesn't match the authorization request");
    return issueTokens(db, grant, now);
  }

  const refresh = form.get("refresh_token");
  if (!refresh) throw new OAuthError("invalid_request", "refresh_token is required");
  if (form.get("scope") && !checkScope(form.get("scope"))) throw new OAuthError("invalid_scope", `The only scope is "${SCOPE}"`);
  const { grant } = await spend(db, hashSecret(refresh), "refresh", client.id, now);
  return issueTokens(db, grant, now);
}

// RFC 7009: always succeeds. Revoking a refresh token disconnects the app; an access token, just that token.
export async function revokeOAuthToken(db: Db, form: URLSearchParams, authorization: string | null, fetchDoc?: FetchClientDocument) {
  const client = await authenticateClient(db, form, authorization, fetchDoc);
  const token = form.get("token");
  if (!token) return;
  const [row] = await db
    .select({ token: oauthToken, grant: oauthGrant })
    .from(oauthToken)
    .innerJoin(oauthGrant, eq(oauthToken.grantId, oauthGrant.id))
    .where(eq(oauthToken.hash, hashSecret(token)));
  if (!row || row.grant.clientId !== client.id) return;
  if (row.token.kind === "refresh") await db.delete(oauthGrant).where(eq(oauthGrant.id, row.grant.id));
  else await db.delete(oauthToken).where(eq(oauthToken.hash, row.token.hash));
}

// ---------- The protected resource ----------

export const isOAuthAccessToken = (token: string) => token.startsWith(ACCESS_PREFIX);

// The creator an access token belongs to, if it's live and was issued for this MCP endpoint.
export async function accessTokenOwner(db: Db, token: string, resource: string, now = new Date()) {
  if (!isOAuthAccessToken(token)) return null;
  const [row] = await db
    .select({ token: oauthToken, grant: oauthGrant })
    .from(oauthToken)
    .innerJoin(oauthGrant, eq(oauthToken.grantId, oauthGrant.id))
    .where(and(eq(oauthToken.hash, hashSecret(token)), eq(oauthToken.kind, "access")));
  if (!row || row.token.expiresAt <= now || row.grant.resource !== resource) return null;
  await db.update(oauthGrant).set({ lastUsedAt: now }).where(eq(oauthGrant.id, row.grant.id));
  return { userId: row.grant.userId, timeZone: row.grant.timeZone, clientName: row.grant.clientName };
}

// ---------- Connected apps on /connect ----------

export async function listGrants(db: Db, userId: string) {
  const rows = await db.select().from(oauthGrant).where(eq(oauthGrant.userId, userId)).orderBy(desc(oauthGrant.createdAt));
  return rows.map((g) => ({
    id: g.id,
    name: g.clientName,
    redirectHost: g.redirectHost,
    createdAt: g.createdAt.toISOString(),
    lastUsedAt: g.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function revokeGrant(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db.delete(oauthGrant).where(and(eq(oauthGrant.id, id), eq(oauthGrant.userId, userId))).returning({ id: oauthGrant.id });
  return rows.length > 0;
}
