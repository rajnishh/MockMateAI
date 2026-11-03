import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createToken } from "@/lib/agent/tokens";
import type { Db } from "@/lib/db";
import { oauthClient, oauthToken, user } from "@/lib/db/schema";
import { type FetchClientDocument, isClientDocumentUrl, isPrivateAddress, parseClientDocument } from "@/lib/oauth/client-document";
import { isTrustedOrigin, publicOrigin } from "@/lib/oauth/origin";
import { connectorOwner, connectorUnauthorized } from "@/lib/oauth/resource";
import {
  ACCESS_TTL_SEC,
  accessTokenOwner,
  approve,
  AuthorizeError,
  authorizationServerMetadata,
  CODE_TTL_SEC,
  deny,
  exchangeToken,
  listGrants,
  OAuthError,
  parseAuthorization,
  protectedResourceMetadata,
  pruneUnusedClients,
  registerClient,
  revokeGrant,
  revokeOAuthToken,
  s256,
} from "@/lib/oauth/server";
import { testDb } from "./helpers/db";

const ISSUER = "https://reelkar.example.dev";
const RESOURCE = `${ISSUER}/api/mcp`;
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

const form = (o: Record<string, string>) => new URLSearchParams(o);
const verifier = () => randomBytes(32).toString("base64url");

async function rejects(p: Promise<unknown>, error: string) {
  const e = await p.then(
    () => null,
    (x) => x,
  );
  expect(e).toBeInstanceOf(OAuthError);
  expect((e as OAuthError).error).toBe(error);
  return e as OAuthError;
}

describe("Connector OAuth 2.1", { timeout: 30_000 }, () => {
  let db: Db;
  let clientId: string;

  // A full authorize → consent → code round trip, as claude.ai does it.
  async function authorize(opts: { verifier?: string; clientId?: string; now?: Date; extra?: Record<string, string>; fetchDoc?: FetchClientDocument } = {}) {
    const v = opts.verifier ?? verifier();
    const params = form({
      response_type: "code",
      client_id: opts.clientId ?? clientId,
      redirect_uri: CALLBACK,
      code_challenge: s256(v),
      code_challenge_method: "S256",
      state: "xyz",
      scope: "reels",
      resource: RESOURCE,
      ...opts.extra,
    });
    const req = await parseAuthorization(db, params, ISSUER, opts.fetchDoc);
    const back = new URL(await approve(db, req, ISSUER, "u1", "Asia/Dubai", opts.now));
    return { code: back.searchParams.get("code")!, back, verifier: v };
  }

  const redeem = (code: string, v: string, extra: Record<string, string> = {}, now?: Date) =>
    exchangeToken(db, form({ grant_type: "authorization_code", code, code_verifier: v, client_id: clientId, redirect_uri: CALLBACK, resource: RESOURCE, ...extra }), null, ISSUER, { now });

  beforeEach(async () => {
    db = await testDb();
    const now = new Date();
    await db.insert(user).values({ id: "u1", name: "One", email: "one@example.com", createdAt: now, updatedAt: now });
    clientId = (await registerClient(db, { client_name: "Claude", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"] })).client_id;
  });

  it("publishes protected-resource and authorization-server metadata", () => {
    expect(protectedResourceMetadata(ISSUER)).toMatchObject({ resource: RESOURCE, authorization_servers: [ISSUER], scopes_supported: ["reels"] });
    const as = authorizationServerMetadata(ISSUER);
    expect(as.issuer).toBe(ISSUER);
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
    expect(as.registration_endpoint).toBe(`${ISSUER}/api/oauth/register`);
    expect(as.authorization_response_iss_parameter_supported).toBe(true);
  });

  it("registers public clients and refuses bad redirect URIs", async () => {
    const c = await registerClient(db, { client_name: "Claude", redirect_uris: [CALLBACK] });
    expect(c.client_id).toMatch(/^rkc_/);
    expect(c.token_endpoint_auth_method).toBe("none");
    expect("client_secret" in c).toBe(false);
    await rejects(registerClient(db, { redirect_uris: ["http://evil.example/cb"] }), "invalid_redirect_uri");
    await rejects(registerClient(db, { redirect_uris: ["https://claude.ai/cb#frag"] }), "invalid_redirect_uri");
    await rejects(registerClient(db, {}), "invalid_redirect_uri");
    await rejects(registerClient(db, { redirect_uris: [CALLBACK], grant_types: ["client_credentials"] }), "invalid_client_metadata");
    expect((await registerClient(db, { redirect_uris: ["http://localhost:6274/oauth/callback"] })).client_id).toBeTruthy();
  });

  it("never redirects to an unknown client or an unregistered redirect URI", async () => {
    const base = { response_type: "code", code_challenge: s256(verifier()), code_challenge_method: "S256" };
    const unknown = await parseAuthorization(db, form({ ...base, client_id: "rkc_nope", redirect_uri: CALLBACK }), ISSUER).catch((e) => e);
    expect(unknown).toBeInstanceOf(AuthorizeError);
    expect(unknown.redirect).toBeNull();
    const wrongUri = await parseAuthorization(db, form({ ...base, client_id: clientId, redirect_uri: "https://claude.ai/api/mcp/auth_callback/x" }), ISSUER).catch((e) => e);
    expect(wrongUri.redirect).toBeNull();
  });

  it("requires PKCE with S256 and a resource on this server, and says so to the client", async () => {
    const bad = async (extra: Record<string, string>) => {
      const e = await authorize({ extra }).catch((x) => x);
      expect(e).toBeInstanceOf(AuthorizeError);
      const url = new URL(e.redirect);
      expect(url.origin + url.pathname).toBe(CALLBACK);
      expect(url.searchParams.get("state")).toBe("xyz");
      expect(url.searchParams.get("iss")).toBe(ISSUER);
      return url.searchParams.get("error");
    };
    expect(await bad({ code_challenge_method: "plain" })).toBe("invalid_request");
    expect(await bad({ code_challenge: "" })).toBe("invalid_request");
    expect(await bad({ response_type: "token" })).toBe("unsupported_response_type");
    expect(await bad({ scope: "admin" })).toBe("invalid_scope");
    expect(await bad({ resource: "https://other.example/api/mcp" })).toBe("invalid_target");
  });

  it("returns the code with state and iss, and an access_denied on Deny", async () => {
    const { back } = await authorize();
    expect(back.origin + back.pathname).toBe(CALLBACK);
    expect(back.searchParams.get("state")).toBe("xyz");
    expect(back.searchParams.get("iss")).toBe(ISSUER);
    const req = await parseAuthorization(db, form({ response_type: "code", client_id: clientId, redirect_uri: CALLBACK, code_challenge: s256(verifier()), code_challenge_method: "S256", state: "s1" }), ISSUER);
    expect(new URL(deny(req, ISSUER)).searchParams.get("error")).toBe("access_denied");
  });

  it("stores only hashes of codes and tokens", async () => {
    const { code, verifier: v } = await authorize();
    const tokens = await redeem(code, v);
    const hashes = (await db.select().from(oauthToken)).map((r) => r.hash).join(" ");
    for (const secret of [code, tokens.access_token, tokens.refresh_token]) expect(hashes).not.toContain(secret);
  });

  it("exchanges a code for tokens, and the access token works only on this endpoint", async () => {
    const { code, verifier: v } = await authorize();
    const tokens = await redeem(code, v);
    expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: ACCESS_TTL_SEC, scope: "reels" });
    expect(await accessTokenOwner(db, tokens.access_token, RESOURCE)).toEqual({ userId: "u1", timeZone: "Asia/Dubai", clientName: "Claude" });
    expect(await accessTokenOwner(db, tokens.access_token, "https://other.example/api/mcp")).toBeNull();
    expect(await accessTokenOwner(db, tokens.access_token, RESOURCE, new Date(Date.now() + (ACCESS_TTL_SEC + 5) * 1000))).toBeNull();
    expect(await accessTokenOwner(db, tokens.refresh_token, RESOURCE)).toBeNull();
  });

  it("refuses a wrong verifier, a wrong redirect URI and another client's code", async () => {
    const a = await authorize();
    await rejects(redeem(a.code, verifier()), "invalid_grant");
    const b = await authorize();
    await rejects(redeem(b.code, b.verifier, { redirect_uri: "https://claude.ai/other" }), "invalid_grant");
    const other = (await registerClient(db, { redirect_uris: [CALLBACK] })).client_id;
    const c = await authorize();
    await rejects(redeem(c.code, c.verifier, { client_id: other }), "invalid_grant");
    await rejects(redeem(c.code, "short"), "invalid_request");
  });

  it("doesn't use up a code on a failed attempt, so the right verifier still works", async () => {
    const { code, verifier: v } = await authorize();
    await rejects(redeem(code, verifier()), "invalid_grant");
    const tokens = await redeem(code, v);
    expect(await accessTokenOwner(db, tokens.access_token, RESOURCE)).toMatchObject({ userId: "u1" });
    expect(await listGrants(db, "u1")).toHaveLength(1);
  });

  it("keeps one connected app per assistant, even when Allow is pressed twice at once", async () => {
    await Promise.all([authorize(), authorize()]);
    await authorize();
    expect(await listGrants(db, "u1")).toHaveLength(1);
  });

  it("answers malformed client credentials with invalid_client, not a crash", async () => {
    const basic = `Basic ${Buffer.from(`${clientId}%zz:secret`).toString("base64")}`;
    const e = await exchangeToken(db, form({ grant_type: "refresh_token", refresh_token: "x" }), basic, ISSUER).catch((err) => err);
    expect(e).toMatchObject({ error: "invalid_client", status: 401 });
  });

  it("drops registrations nobody connected within a day", async () => {
    const stale = (await registerClient(db, { redirect_uris: [CALLBACK] })).client_id;
    await authorize();
    await db.update(oauthClient).set({ createdAt: new Date(Date.now() - 2 * 86_400_000) });
    await pruneUnusedClients(db);
    const left = (await db.select().from(oauthClient)).map((c) => c.id);
    expect(left).toContain(clientId);
    expect(left).not.toContain(stale);
  });

  it("revokes the connection when a code is used twice", async () => {
    const { code, verifier: v } = await authorize();
    const tokens = await redeem(code, v);
    const e = await rejects(redeem(code, v), "invalid_grant");
    expect(e.description).toMatch(/already used/);
    expect(await accessTokenOwner(db, tokens.access_token, RESOURCE)).toBeNull();
    expect(await listGrants(db, "u1")).toEqual([]);
  });

  it("expires codes after about a minute", async () => {
    const { code, verifier: v } = await authorize();
    await rejects(redeem(code, v, {}, new Date(Date.now() + (CODE_TTL_SEC + 1) * 1000)), "invalid_grant");
  });

  it("rotates refresh tokens, and replaying an old one disconnects the app", async () => {
    const { code, verifier: v } = await authorize();
    const first = await redeem(code, v);
    const refresh = (token: string) => exchangeToken(db, form({ grant_type: "refresh_token", refresh_token: token, client_id: clientId }), null, ISSUER);
    const second = await refresh(first.refresh_token);
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(second.access_token).not.toBe(first.access_token);
    expect(await accessTokenOwner(db, second.access_token, RESOURCE)).not.toBeNull();
    await rejects(refresh(first.refresh_token), "invalid_grant");
    expect(await accessTokenOwner(db, second.access_token, RESOURCE)).toBeNull();
    await rejects(refresh(second.refresh_token), "invalid_grant");
  });

  it("revokes tokens (RFC 7009) and lets the creator disconnect apps", async () => {
    const one = await authorize();
    const t1 = await redeem(one.code, one.verifier);
    await revokeOAuthToken(db, form({ token: t1.access_token, client_id: clientId }), null);
    expect(await accessTokenOwner(db, t1.access_token, RESOURCE)).toBeNull();
    await revokeOAuthToken(db, form({ token: t1.refresh_token, client_id: clientId }), null);
    expect(await listGrants(db, "u1")).toEqual([]);
    await revokeOAuthToken(db, form({ token: "unknown", client_id: clientId }), null);

    const two = await authorize();
    const t2 = await redeem(two.code, two.verifier);
    const [app] = await listGrants(db, "u1");
    expect(app).toMatchObject({ name: "Claude", redirectHost: "claude.ai" });
    expect(await revokeGrant(db, "someone-else", app.id)).toBe(false);
    expect(await revokeGrant(db, "u1", app.id)).toBe(true);
    expect(await accessTokenOwner(db, t2.access_token, RESOURCE)).toBeNull();
  });

  it("requires the secret of confidential clients", async () => {
    const c = await registerClient(db, { redirect_uris: [CALLBACK], token_endpoint_auth_method: "client_secret_basic" });
    expect(c.client_secret).toMatch(/^rks_/);
    clientId = c.client_id;
    const { code, verifier: v } = await authorize();
    const params = form({ grant_type: "authorization_code", code, code_verifier: v, redirect_uri: CALLBACK });
    await rejects(exchangeToken(db, params, `Basic ${Buffer.from(`${c.client_id}:wrong`).toString("base64")}`, ISSUER), "invalid_client");
    const ok = await exchangeToken(db, params, `Basic ${Buffer.from(`${c.client_id}:${c.client_secret}`).toString("base64")}`, ISSUER);
    expect(ok.access_token).toMatch(/^rkat_/);
  });

  it("accepts clients identified by a metadata document URL", async () => {
    const docUrl = "https://claude.ai/oauth/mcp-client-metadata";
    const fetchDoc: FetchClientDocument = async (url) => parseClientDocument(url, { client_id: url, client_name: "Claude", redirect_uris: [CALLBACK] });
    const { back } = await authorize({ clientId: docUrl, fetchDoc });
    expect(back.searchParams.get("code")).toBeTruthy();
    expect(isClientDocumentUrl(docUrl)).toBe(true);
    expect(isClientDocumentUrl("https://claude.ai")).toBe(false);
    expect(isClientDocumentUrl("rkc_abc")).toBe(false);
    expect(() => parseClientDocument(docUrl, { client_id: "https://evil.example/x", redirect_uris: [CALLBACK] })).toThrow();
    expect(() => parseClientDocument(docUrl, { client_id: docUrl, redirect_uris: [CALLBACK], token_endpoint_auth_method: "client_secret_basic" })).toThrow();
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) expect(isPrivateAddress(ip)).toBe(true);
    expect(isPrivateAddress("160.79.104.10")).toBe(false);
  });

  it("guards /api/mcp: 401 with WWW-Authenticate, personal keys and OAuth tokens both work", async () => {
    const res = connectorUnauthorized(ISSUER, false);
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe(`Bearer resource_metadata="${ISSUER}/.well-known/oauth-protected-resource/api/mcp", scope="reels"`);
    expect(connectorUnauthorized(ISSUER, true).headers.get("WWW-Authenticate")).toContain('error="invalid_token"');

    const { token } = await createToken(db, "u1", "Claude Code", "Asia/Kolkata");
    expect(await connectorOwner(db, `Bearer ${token}`, ISSUER)).toEqual({ userId: "u1", timeZone: "Asia/Kolkata" });
    const { code, verifier: v } = await authorize();
    const { access_token } = await redeem(code, v);
    expect(await connectorOwner(db, `Bearer ${access_token}`, ISSUER)).toMatchObject({ userId: "u1", clientName: "Claude" });
    expect(await connectorOwner(db, `Bearer ${access_token}`, "https://other.example")).toBeNull();
    expect(await connectorOwner(db, null, ISSUER)).toBeNull();
    expect(await connectorOwner(db, "Bearer rk_wrong", ISSUER)).toBeNull();
  });

  it("follows the public address only when it's trusted", () => {
    const cfg = { baseURL: "http://localhost:3000", extra: ["https://reelkar.istari-ai.dev"], dev: true };
    const h = (o: Record<string, string>) => new Headers(o);
    expect(publicOrigin(h({ host: "abc-def.trycloudflare.com", "x-forwarded-proto": "https" }), cfg)).toBe("https://abc-def.trycloudflare.com");
    expect(publicOrigin(h({ host: "reelkar.istari-ai.dev", "x-forwarded-proto": "https" }), cfg)).toBe("https://reelkar.istari-ai.dev");
    expect(publicOrigin(h({ host: "localhost:3002" }), cfg)).toBe("http://localhost:3002");
    expect(publicOrigin(h({ host: "evil.example", "x-forwarded-proto": "https" }), cfg)).toBe("http://localhost:3000");
    expect(publicOrigin(h({ host: "abc.trycloudflare.com", "x-forwarded-proto": "https" }), { ...cfg, dev: false })).toBe("http://localhost:3000");
    expect(isTrustedOrigin("https://reelkar.istari-ai.dev/x", cfg)).toBe(false);
  });
});
