# Reelkar connector for AI assistants

Creators can use Reelkar from an AI assistant they already pay for (Claude Code, Claude Desktop, Cursor; ChatGPT and claude.ai on the web need OAuth, which comes next). The assistant gets the same actions as Ask Reelkar:

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
- Sign-in: `Authorization: Bearer rk_…`, a personal key from **Connect AI** (`/connect`) in the web app. Only a SHA-256 hash is stored; keys can be removed at any time. Each key remembers the creator's time zone.
- Limits: 300 tool calls an hour per creator. Free reels and credits are counted as usual.
- Code:
  - `src/lib/agent/mcp.ts`: protocol and tools, built from `src/lib/agent/actions.ts`
  - `src/lib/agent/tokens.ts`: keys
  - `src/app/api/mcp/route.ts`: the endpoint

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

## ChatGPT and claude.ai on the web

These connect from their own servers, so they can't reach `localhost`, and their connector screens use OAuth sign-in rather than a pasted key. Next steps:

1. **OAuth:** add OAuth 2.1 to Reelkar, with sign-in, consent, dynamic client registration and protected-resource metadata, so "Connect" in ChatGPT or Claude opens Reelkar's sign-in.
2. **Local testing:** expose the local server with a tunnel (`cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`) and add the tunnel's `https://…/api/mcp` link as a custom connector.
3. **Going live:** after launch, submit Reelkar to each assistant's connector directory. Each has its own review.
