#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server for the Reelkar beta.
# Run as root:  curl -fsSL <raw url of this file> | bash   (or copy it over and run it)
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/rajnishh/MockMateAI.git}"
BRANCH="${BRANCH:-claude/story-film-saas-plan-ncinxf}"
APP_DIR=/opt/reelkar

echo "==> Installing Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Firewall: SSH, HTTP, HTTPS only"
apt-get install -y ufw >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null

echo "==> Swap (helps video rendering on smaller machines)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

echo "==> Automatic security updates"
apt-get install -y unattended-upgrades >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Getting the code into $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

ENV_FILE="$APP_DIR/story-film/deploy/.env"
if [ ! -f "$ENV_FILE" ]; then
  cp "$APP_DIR/story-film/deploy/.env.example" "$ENV_FILE"
  # Fill the secrets so nobody has to generate them by hand.
  sed -i "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=$(openssl rand -hex 24)#" "$ENV_FILE"
  sed -i "s#^BETTER_AUTH_SECRET=.*#BETTER_AUTH_SECRET=$(openssl rand -base64 32)#" "$ENV_FILE"
  sed -i "s#^TOKEN_ENCRYPTION_KEY=.*#TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)#" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

echo "==> Nightly backups at 02:30"
cp "$APP_DIR/story-film/deploy/backup.sh" /usr/local/bin/reelkar-backup
chmod +x /usr/local/bin/reelkar-backup
echo "30 2 * * * root /usr/local/bin/reelkar-backup >> /var/log/reelkar-backup.log 2>&1" > /etc/cron.d/reelkar-backup

cat <<MSG

Done. Next:
  1. Edit $ENV_FILE: set DOMAIN and your Cloudflare keys (secrets are already filled in).
  2. Point the DOMAIN's DNS A record at this server's IP.
  3. Start it:  cd $APP_DIR/story-film/deploy && docker compose up -d --build
  4. Check:     curl https://YOUR_DOMAIN/api/health   (should print {"ok":true})
MSG
