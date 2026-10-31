# Beta server: setup guide

One Linux server runs everything for the beta: the web app and API, the background worker that makes videos and posts them, Postgres, Redis, the Kokoro voice service and Caddy (HTTPS). Files: `deploy/` (Docker Compose, Caddy, scripts) and `Dockerfile`.

```
phone app ─┐                         ┌─ web  (Next.js: website + API)
web users ─┼─ https://api.<domain> ─ Caddy ─┤
Instagram ─┘   (auto HTTPS)          └─ worker (videos, posting) ─ Kokoro (voice)
                                         Postgres · Redis · output volume (videos)
```

## 1. Rent a server (about $45–50 a month)

Pick a region close to your users: **Mumbai or Bangalore** for Indian creators.

| Provider | Plan to choose | Notes |
|---|---|---|
| DigitalOcean | Droplet, Bangalore (BLR1), 4 vCPU / 8 GB, Ubuntu 24.04 | Simple dashboard, easy to resize later |
| AWS Lightsail | Mumbai, 8 GB plan, Ubuntu 24.04 | Cheapest 8 GB option at AWS; attach a static IP |

8 GB of memory is the comfortable minimum: video rendering (FFmpeg), the voice model and the app build all need room. Check the current price on the provider's page; it changes. Add your SSH key when creating the server.

## 2. Point a domain at it

The app needs a public https address (Instagram downloads videos from it, and Google and Meta only redirect to https). Any domain you own works; the product domain **reelkar.in** was available on 2026-10-28.

At your domain registrar, add a DNS **A record**: name `api`, value = the server's IP address. Result: `api.reelkar.in` → your server.

## 3. Set up the server (10 minutes)

SSH in as root and run:

```bash
# If the GitHub repo is private, set REPO_URL with a read-only token first, e.g.
# export REPO_URL=https://<token>@github.com/rajnishh/MockMateAI.git
curl -fsSL https://raw.githubusercontent.com/rajnishh/MockMateAI/claude/story-film-saas-plan-ncinxf/story-film/deploy/setup-server.sh -o setup.sh
bash setup.sh
```

It installs Docker, opens only ports 22/80/443, adds swap and automatic security updates, downloads the code to `/opt/reelkar`, creates `deploy/.env` with fresh secrets, and schedules nightly backups.

## 4. Fill in the settings

Edit `/opt/reelkar/story-film/deploy/.env`:

| Setting | Where to get it | Needed for |
|---|---|---|
| `DOMAIN` | e.g. `api.reelkar.in` | Everything |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → AI → Workers AI → create token | Scripts and pictures (free tier) |
| `GOOGLE_CLIENT_ID/SECRET` | Google Cloud → Credentials → OAuth client (web) | Google sign-in, YouTube posting |
| `INSTAGRAM_APP_ID/SECRET` | Meta App Dashboard → Instagram → API setup with Instagram login | Instagram posting |
| `SMS_PROVIDER=msg91` + keys | MSG91 (needs DLT registration in India) | Real SMS codes. Until then, codes appear in the logs: `docker compose logs web \| grep OTP` |
| `FAL_KEY`, `SARVAM_API_KEY`, `OPENROUTER_API_KEY` | fal.ai, Sarvam, OpenRouter | Optional: premium video, songs, more languages, better scripts |

Redirect URIs to register:
- Google: `https://<DOMAIN>/api/auth/callback/google` and `https://<DOMAIN>/api/connect/youtube/callback`
- Meta (Instagram): `https://<DOMAIN>/api/connect/instagram/callback`

## 5. Start it

```bash
cd /opt/reelkar/story-film/deploy
docker compose up -d --build     # first build takes 5–10 minutes
curl https://<DOMAIN>/api/health  # {"ok":true}
```

Then build the phone app against it: set `EXPO_PUBLIC_API_URL=https://<DOMAIN>` for the EAS `preview` build (see `mobile/README.md`).

## Everyday operations

| Task | Command (in `/opt/reelkar/story-film/deploy`) |
|---|---|
| See what's running | `docker compose ps` |
| Logs | `docker compose logs -f web` or `worker` |
| Update to the latest code | `./update.sh` (database migrations run automatically) |
| Backup now | `reelkar-backup` (runs nightly at 02:30, keeps 7 days in `/var/backups/reelkar`) |
| Restore the database | `docker compose exec -T postgres pg_restore -U reelkar -d reelkar --clean < /var/backups/reelkar/db-YYYY-MM-DD.dump` |
| Restart one service | `docker compose restart worker` |

Copy backups off the server too (e.g. `rclone` to Cloudflare R2 or Google Drive); a backup on the same disk doesn't survive losing the server.

## Limits of this setup

- One server: fine for a beta of a few hundred creators. When videos queue up, move the worker to a second machine (same image, same `.env`, shared object storage).
- Videos live on the server's disk (the `output` volume). Object storage (Cloudflare R2) is the next step before a public launch.
- Kokoro voice runs on the CPU: a 30-second reel takes roughly 10–30 seconds of voice work.
