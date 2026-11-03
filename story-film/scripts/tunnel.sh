#!/usr/bin/env bash
# Puts the local Reelkar on the internet with a free Cloudflare Tunnel, so claude.ai and the
# Claude phone app can reach the connector at <address>/api/mcp. See docs/CONNECTORS.md.
#
#   scripts/tunnel.sh [port]                        quick tunnel: a random https://….trycloudflare.com
#                                                   address, no account, changes every run (dev only)
#   scripts/tunnel.sh setup <hostname> [name]       named tunnel, once: e.g. reelkar.istari-ai.dev
#   scripts/tunnel.sh run <hostname> [port] [name]  named tunnel: a stable address on your domain
set -euo pipefail

if ! command -v cloudflared >/dev/null; then
  echo "cloudflared isn't installed. Install it with: brew install cloudflared" >&2
  exit 1
fi

cmd="${1:-quick}"
case "$cmd" in
  setup)
    host="${2:?Usage: scripts/tunnel.sh setup <hostname> [tunnel name]}"
    name="${3:-reelkar}"
    # A browser window opens: pick the domain (it must already be on your Cloudflare account).
    [ -f "$HOME/.cloudflared/cert.pem" ] || cloudflared tunnel login
    cloudflared tunnel info "$name" >/dev/null 2>&1 || cloudflared tunnel create "$name"
    # Adds a CNAME for the hostname that points at the tunnel.
    cloudflared tunnel route dns "$name" "$host"
    echo
    echo "Done. Add this line to story-film/.env, then restart Reelkar:"
    echo "  PUBLIC_ORIGINS=https://$host"
    echo "Then start the tunnel with: scripts/tunnel.sh run $host"
    ;;
  run)
    host="${2:?Usage: scripts/tunnel.sh run <hostname> [port] [tunnel name]}"
    port="${3:-3000}"
    name="${4:-reelkar}"
    echo "Connector address: https://$host/api/mcp (Reelkar on port $port)"
    exec cloudflared tunnel --no-autoupdate run --url "http://localhost:$port" "$name"
    ;;
  *)
    port="$cmd"
    [ "$port" = quick ] && port="${2:-3000}"
    case "$port" in *[!0-9]*) echo "Unknown command: $port" >&2; exit 1 ;; esac
    echo "Starting a quick tunnel to http://localhost:$port (Ctrl+C stops it)…"
    # cloudflared prints the address in a box on stderr; show it plainly once it appears.
    cloudflared tunnel --no-autoupdate --url "http://localhost:$port" 2>&1 | while IFS= read -r line; do
      echo "$line"
      if [[ "$line" =~ (https://[a-z0-9-]+\.trycloudflare\.com) ]]; then
        url="${BASH_REMATCH[1]}"
        echo
        echo "  Connector address for claude.ai: $url/api/mcp"
        echo "  Quick tunnels work with npm run dev only, and the address changes every time."
        echo
      fi
    done
    ;;
esac
