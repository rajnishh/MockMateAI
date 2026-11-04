---
name: run-local
description: Set up and run Reelkar (story-film/) on this computer, from a fresh clone to the web app, worker, mobile app and AI connector working. Use when asked to set up, install, run, start, restart, update or troubleshoot Reelkar locally.
---

# Run Reelkar locally

Work through the steps in order. Check each step yourself before going on, and fix what you can. Ask the creator only for things you can't get yourself: account keys, installs that need their password, or a choice. Keep updates short.

Everything below runs in `story-film/` unless it says otherwise.

## 0. Look first

- Find the OS (macOS, Linux or Windows). On Windows, use WSL 2 if it's available; otherwise use PowerShell equivalents.
- Check what is already installed and running, so you don't redo work:
  - `node -v`: needs 22 or newer.
  - `docker info`
  - `ffmpeg -version`
  - `python3 --version`: 3.11 or 3.12 is needed for face effects.
  - `git status`
- If there is no `node_modules` or no `.env`, treat it as a first run. Otherwise treat it as an update and go to step 6.

## 1. Tools

Install whatever is missing:
- Node 22 or newer (nvm or Homebrew), FFmpeg, Python 3.11 or 3.12.
- Docker Desktop: the creator installs and opens it. Wait for `docker info` to succeed.
- Show the exact command before anything that needs `sudo` or a password.

## 2. Services (Docker)

- **Postgres:**
  `docker run -d --name reelkar-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=storyfilm -v reelkar-pg:/var/lib/postgresql/data postgres:17`
- **Redis:**
  `docker run -d --name reelkar-redis -p 6379:6379 redis:7`
- **Kokoro (voice):**
  `docker run -d --name reelkar-kokoro -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest`
- If a container already exists, start it with `docker start <name>`; don't create a second one.
- If a port is taken, find out what is using it before changing anything.

## 3. Settings (`.env`)

- If `.env` doesn't exist, copy `.env.example` to `.env`.
- Generate `BETTER_AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` yourself with `openssl rand -base64 32`.
- Leave `BETTER_AUTH_URL=http://localhost:3000` and `SMS_PROVIDER=console`. Sign-in codes print in the `npm run dev` log.
- Ask the creator for `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. A free Cloudflare account works; the API token needs the "Workers AI" permission. Without these, reels can't be made.
- Don't print `.env` values back to the creator, and never commit `.env`.
- These are optional; leave them empty unless the creator asks:
  - Google sign-in and YouTube (`GOOGLE_*`)
  - Instagram (needs a public https URL)
  - Razorpay
  - `FAL_KEY` (premium videos)
  - `OPENROUTER_API_KEY`
  - C2PA (`scripts/dev-c2pa-cert.sh` makes a dev certificate)

## 4. Face effects (optional; "Edit my video")

```bash
python3 -m venv .venv
.venv/bin/pip install -r vision/requirements.txt
```

Add `PYTHON=<absolute path>/story-film/.venv/bin/python` to `.env`.

## 5. Install and prepare

```bash
npm install
npm run db:migrate
npm run typecheck && npm test   # should all pass; report any failure with its output
```

## 6. Run

Start these as two long-running background processes and watch their logs:
- `npm run worker`: makes the reels.
- `npm run dev`: the web app at http://localhost:3000.

Check that they work:
- `curl -sI http://localhost:3000` returns 200 or a redirect.
- The worker log shows no errors.

Then tell the creator to:
1. open http://localhost:3000;
2. sign in with a phone number (the code is in the dev log);
3. make one reel.

**Updating later:**
1. `git pull`
2. `npm install`
3. `npm run db:migrate`
4. Restart both processes.

## 7. Mobile app (optional)

```bash
cd mobile && npm install
```

- Find the computer's local network address (macOS: `ipconfig getifaddr en0`; Linux: `hostname -I`).
- Write `EXPO_PUBLIC_API_URL=http://<that address>:3000` to `mobile/.env.local`.
- Run `npx expo start`. The creator scans the QR code with Expo Go, on the same Wi-Fi.
- Leave `EXPO_PUBLIC_API_URL` out to get demo mode, which uses sample data.

## 8. AI connector (optional)

Follow `docs/CONNECTORS.md`:
1. The creator opens http://localhost:3000/connect and creates a key.
2. To add it to Claude Code, the creator runs:
   `claude mcp add --transport http reelkar http://localhost:3000/api/mcp --header "Authorization: Bearer <key>"`
   Don't ask them to paste the key into this chat.
3. In a new session, test it with: "Use Reelkar to suggest 3 reel ideas about chai."

## Stop

1. Stop the dev and worker processes.
2. Run `docker stop reelkar-pg reelkar-redis reelkar-kokoro`. Data stays in the `reelkar-pg` volume.

## When something breaks

| Problem | Likely fix |
|---|---|
| `ECONNREFUSED 5432` or `6379` | The container isn't running. Run `docker start …`. |
| Reels stay "queued" | The worker isn't running, or Redis is down. |
| Voice errors | Kokoro is still downloading its model on first start. Wait, then check `docker logs reelkar-kokoro`. |
| "relation does not exist" | Run `npm run db:migrate`. |
| Phone can't reach the backend | Use the LAN IP, not localhost; check the firewall allows port 3000. |
| Face effects skipped | Check `PYTHON` in `.env`; run `.venv/bin/python vision/analyze.py --help`. |
