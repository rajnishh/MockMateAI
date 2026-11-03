# Reelkar connector for AI assistants

Creators can use Reelkar from an AI assistant they already pay for: claude.ai and the Claude phone app (sign in with OAuth), or Claude Code, Claude Desktop and Cursor (a personal key). The assistant gets the same actions as Ask Reelkar:

- suggest ideas
- make one reel, or a week of reels
- make a reel from a script the assistant wrote itself (`make_reel_from_script`). The assistant does the writing on the creator's own subscription, and Reelkar only makes the video.
- check one reel's progress and get its links: watch the video, or open it in the Reelkar app (`get_reel`)
- post or schedule a reel
- write a caption
- list reels and their progress
- change an uploaded video's voice or sounds
- change the posting mode
- answer a proposal (approve or cancel a post)

The creator's posting mode, free reels and credits apply exactly as in the app. Everything the assistant does shows up in Ask Reelkar as "Via Claude: …".

- Endpoint: `POST /api/mcp` (Model Context Protocol, Streamable HTTP, plain JSON replies, no server stream)
- Sign-in, either:
  - **OAuth 2.1** (claude.ai, the Claude phone app, any assistant that follows the MCP authorization spec): the assistant sends the creator to Reelkar's sign-in and an Allow / Deny screen, and gets an access token for an hour plus a refresh token. Connected apps are listed on `/connect`, where they can be disconnected.
  - **A personal key**: `Authorization: Bearer rk_…`, from **Connect AI** (`/connect`) in the web app. Keys can be removed at any time.
  - Only SHA-256 hashes of keys, codes and tokens are stored. Each key and each connected app remembers the creator's time zone.
- Limits: 300 tool calls an hour per creator. Free reels and credits are counted as usual.
- Code:
  - `src/lib/agent/mcp.ts`: protocol and tools, built from `src/lib/agent/actions.ts`
  - `src/lib/agent/tokens.ts`: keys
  - `src/lib/oauth/`: OAuth (`server.ts` codes, tokens and metadata; `origin.ts` the public address; `client-document.ts` client metadata documents; `resource.ts` who is calling `/api/mcp`)
  - `src/app/api/mcp/route.ts`: the endpoint; `src/app/oauth/authorize/page.tsx`: the consent screen; `src/app/api/oauth/*` and `src/app/.well-known/*`: the OAuth endpoints

## Try it on your own machine

1. Run Reelkar locally (see "Run locally" in the README): Postgres, Redis, Kokoro, `npm run db:migrate`, `npm run worker` and `npm run dev`.
2. Open http://localhost:3000, sign in, click **Connect AI**, and create a key. The page fills the key into the commands below for you.
3. Add Reelkar to your assistant:

**Claude Code**

```bash
claude mcp add --transport http reelkar http://localhost:3000/api/mcp --header "Authorization: Bearer rk_YOUR_KEY"
```

**Claude Desktop** (Settings → Developer → Edit config, then restart Claude Desktop). This uses `mcp-remote`, a small bridge, because Desktop's own connector list expects public servers:

```json
{
  "mcpServers": {
    "reelkar": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3000/api/mcp", "--header", "Authorization: Bearer rk_YOUR_KEY"]
    }
  }
}
```

Add `mcpServers` next to what's already in the file. If Reelkar doesn't appear after a restart, Desktop couldn't find `npx` (apps opened from the Dock don't get your shell's PATH, and `mcp-remote` needs Node 18 or newer). Use the full path from `which npx`, and add `"env": { "PATH": "<that folder>:/usr/bin:/bin" }` so `npx` finds the matching `node`. Desktop's connector log is `~/Library/Logs/Claude/mcp.log`.

**Cursor** (Settings → MCP → Add new server):

```json
{ "mcpServers": { "reelkar": { "url": "http://localhost:3000/api/mcp", "headers": { "Authorization": "Bearer rk_YOUR_KEY" } } } }
```

4. Ask, for example: "Use Reelkar to give me 3 Hindi reel ideas about monsoon recipes, make the best one, and post it tomorrow at 7:30 pm." In "ask me first" mode the assistant shows you the proposal and approves it only when you say yes.

## claude.ai and the Claude phone app

claude.ai connects from Anthropic's servers, so it can't reach `localhost`, and it signs in with OAuth instead of a pasted key. Custom connectors need a paid Claude plan (Pro, Max, Team or Enterprise). A connector added on claude.ai on the web shows up in the Claude phone app as well.

### 1. Give Reelkar a public address (free Cloudflare Tunnel)

Install `cloudflared` once: `brew install cloudflared`.

**Quick tunnel, for testing** (no Cloudflare account; the address changes every time):

```bash
npm run dev                 # in one terminal
scripts/tunnel.sh           # in another; prints https://<random>.trycloudflare.com/api/mcp
```

Quick tunnels are trusted only by `npm run dev`. Nothing to set in `.env`.

**Named tunnel, for a stable address on your own domain** (the domain must already be on your Cloudflare account, for example `istari-ai.dev`):

```bash
scripts/tunnel.sh setup reelkar.istari-ai.dev   # once: signs in to Cloudflare in the browser, creates the tunnel and its DNS record
scripts/tunnel.sh run reelkar.istari-ai.dev     # every time, while Reelkar runs on port 3000
```

Then add this line to `.env` and restart Reelkar:

```
PUBLIC_ORIGINS=https://reelkar.istari-ai.dev
```

**How addresses work.** Reelkar answers OAuth on whichever trusted address the request came in on, so the issuer and metadata links follow the tunnel automatically. Trusted addresses are `BETTER_AUTH_URL`, everything in `PUBLIC_ORIGINS` (comma separated), `http://localhost` on any port, and, under `npm run dev` only, `https://*.trycloudflare.com`. Requests for any other host get `BETTER_AUTH_URL`. `PUBLIC_ORIGINS` also lets sign-in work on those addresses. Leave `BETTER_AUTH_URL` as it is (`http://localhost:3000`) for the connector. Change it to the tunnel's address only if you also want links that leave the app to use it, for example Instagram posting (Instagram fetches videos from `BETTER_AUTH_URL`) or Google sign-in. If you do, add `http://localhost:3000` to `PUBLIC_ORIGINS` so signing in on localhost keeps working, and add the new Google redirect URI.

To check the address from outside: `curl https://<address>/.well-known/oauth-protected-resource/api/mcp` should show `"resource": "https://<address>/api/mcp"`.

### 2. Add the connector on claude.ai

1. On claude.ai on the web, open **Settings → Connectors** and choose **Add custom connector**. On a Team or Enterprise plan, an owner adds it in the organization's settings first.
2. Name: `Reelkar`. Remote MCP server URL: `https://<your address>/api/mcp`. Leave the OAuth client ID and secret empty. Claude registers itself.
3. Click **Connect**. Reelkar's sign-in opens (phone code or Google). Then **Allow** on "Claude wants to use Reelkar".
4. In a chat, turn Reelkar on from the tools menu, then ask, for example: "Use Reelkar to make a Hindi reel about monsoon recipes."

**The Claude phone app**: sign in with the same Claude account. The connector added on the web is already there; turn it on in a chat the same way. Disconnect it any time on Reelkar's **Connect AI** page.

### How sign-in works

The connector follows the MCP authorization spec (revision 2026-07-28):

- `/api/mcp` without a valid token answers `401` with `WWW-Authenticate: Bearer resource_metadata="<address>/.well-known/oauth-protected-resource/api/mcp", scope="reels"`.
- Protected-resource metadata (RFC 9728) at `/.well-known/oauth-protected-resource/api/mcp` and `/.well-known/oauth-protected-resource`. Authorization-server metadata (RFC 8414) at `/.well-known/oauth-authorization-server`.
- Clients register with dynamic client registration (`POST /api/oauth/register`, public clients by default; 30 an hour per address). Clients whose `client_id` is a metadata-document URL also work: Reelkar fetches the document (https on a public host only, no redirects, 16 KB, 5 seconds).
- `/oauth/authorize` sends signed-out creators through `/login` and back, then shows the consent screen with the app's name and return address. Only exact registered redirect URIs are accepted. PKCE is required, with S256 only. The answer carries `iss` (RFC 9207).
- `POST /api/oauth/token`: `authorization_code` (codes last 60 seconds and work once) and `refresh_token` (rotated every time; refresh tokens last 30 days). Access tokens last an hour and work only for this server's `/api/mcp` (the `resource`, RFC 8707). Using a code or refresh token twice disconnects the app.
- `POST /api/oauth/revoke` (RFC 7009). Revoking a refresh token disconnects the app.

### Troubleshooting

- **"Couldn't reach the MCP server" on claude.ai**: the tunnel isn't running, or Reelkar isn't. Open `https://<address>/api/health` in a browser.
- **Connect opens a page on `localhost`**: the request reached Reelkar on an address it doesn't trust, so it fell back to `BETTER_AUTH_URL`. For a named tunnel, add it to `PUBLIC_ORIGINS` and restart. Quick tunnels need `npm run dev`.
- **Sign-in on the tunnel says "Invalid origin"**: same fix. The address must be in `PUBLIC_ORIGINS` (or be a quick tunnel under `npm run dev`).
- **It worked yesterday, now it asks to connect again**: quick-tunnel addresses change on every start, and tokens only work on the address they were issued for. Use a named tunnel, or remove and add the connector again with the new address.
- **"This app isn't registered with Reelkar"**: the connector was registered against another database or address. Remove the connector on claude.ai and add it again.
- **Tools fail after some idle time**: refresh tokens last 30 days. After that, or after **Disconnect** on Connect AI, click Connect on claude.ai again.

## ChatGPT

ChatGPT's connectors use the same OAuth flow, so the steps above should carry over (developer mode, then add the `https://<address>/api/mcp` link). Not tried yet.

## Going live

After launch, submit Reelkar to each assistant's connector directory. Each has its own review.
