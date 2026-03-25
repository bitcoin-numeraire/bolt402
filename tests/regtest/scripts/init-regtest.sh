#!/usr/bin/env bash
# init-regtest.sh — Bootstrap the regtest Lightning network for bolt402 tests.
#
# Topology:
#   bitcoind          — regtest chain backend
#   lnd-alice (payer) — bolt402 LND client connects here (gRPC + REST)
#   lnd-bob (receiver)— Aperture uses this for invoices
#   cln (payer)       — bolt402 CLN client connects here (gRPC mTLS)
#   aperture          — reference L402 reverse proxy (backed by lnd-bob)
#   backend           — simple HTTP server behind aperture
#
# Channels:
#   alice → bob  (5M sats, push 1M)  — so alice can pay bob's invoices via Aperture
#   cln   → bob  (5M sats, push 1M)  — so cln can pay bob's invoices via Aperture
#
# Usage: ./init-regtest.sh [docker-compose-file]
# Requirements: docker compose, jq, bash 4+

set -euo pipefail

COMPOSE_FILE="${1:-$(dirname "$0")/../docker-compose.yml}"
PROJECT_DIR="$(cd "$(dirname "$COMPOSE_FILE")" && pwd)"
ENV_FILE="${PROJECT_DIR}/.env.regtest"

# Shorthand helpers
btc()   { docker compose -f "$COMPOSE_FILE" exec -T bitcoind bitcoin-cli -regtest -rpcuser=regtest -rpcpassword=regtest "$@"; }
alice() { docker compose -f "$COMPOSE_FILE" exec -T lnd-alice lncli --network=regtest "$@"; }
bob()   { docker compose -f "$COMPOSE_FILE" exec -T lnd-bob lncli --network=regtest "$@"; }
cln()   { docker compose -f "$COMPOSE_FILE" exec -T cln lightning-cli --network=regtest "$@"; }

log() { echo "[init-regtest] $*"; }

wait_for_sync() {
  local svc="$1" max_wait="${2:-90}"
  log "Waiting for $svc to sync..."
  local elapsed=0
  while [ $elapsed -lt "$max_wait" ]; do
    case "$svc" in
      lnd-alice)
        local synced
        synced=$(alice getinfo 2>/dev/null | jq -r '.synced_to_chain // false') || true
        [ "$synced" = "true" ] && return 0 ;;
      lnd-bob)
        local synced
        synced=$(bob getinfo 2>/dev/null | jq -r '.synced_to_chain // false') || true
        [ "$synced" = "true" ] && return 0 ;;
      cln)
        local warning
        warning=$(cln getinfo 2>/dev/null | jq -r '.warning_bitcoind_sync // empty') || true
        [ -z "$warning" ] && return 0 ;;
    esac
    sleep 2
    elapsed=$((elapsed + 2))
  done
  log "WARNING: $svc may not be fully synced after ${max_wait}s"
}

# ─── Step 1: Mine initial blocks ─────────────────────────────────────

BLOCK_COUNT=$(btc getblockcount)
log "Current block height: $BLOCK_COUNT"

if [ "$BLOCK_COUNT" -lt 101 ]; then
  log "=== Step 1: Mining initial blocks ==="
  btc createwallet "regtest" 2>/dev/null || true
  btc loadwallet "regtest" 2>/dev/null || true
  MINER_ADDR=$(btc getnewaddress)
  btc generatetoaddress 101 "$MINER_ADDR" > /dev/null
  log "Mined 101 blocks."
else
  log "=== Step 1: Blocks already mined (height=$BLOCK_COUNT), skipping ==="
  btc loadwallet "regtest" 2>/dev/null || true
  MINER_ADDR=$(btc getnewaddress)
fi

sleep 3
wait_for_sync lnd-alice
wait_for_sync lnd-bob
wait_for_sync cln

# ─── Step 2: Fund all wallets ─────────────────────────────────────────

log "=== Step 2: Funding wallets ==="

ALICE_ADDR=$(alice newaddress p2tr | jq -r '.address')
BOB_ADDR=$(bob newaddress p2tr | jq -r '.address')
CLN_ADDR=$(cln newaddr | jq -r '.bech32 // .["p2tr-unannounced"]')

log "Alice address: $ALICE_ADDR"
log "Bob address:   $BOB_ADDR"
log "CLN address:   $CLN_ADDR"

btc sendtoaddress "$ALICE_ADDR" 2.0
btc sendtoaddress "$BOB_ADDR" 1.0
btc sendtoaddress "$CLN_ADDR" 2.0

btc generatetoaddress 6 "$MINER_ADDR" > /dev/null
log "Funded all wallets (confirmed)."

sleep 3
wait_for_sync lnd-alice
wait_for_sync lnd-bob
wait_for_sync cln

# ─── Step 3: Connect nodes ───────────────────────────────────────────

log "=== Step 3: Connecting nodes ==="

ALICE_PUBKEY=$(alice getinfo | jq -r '.identity_pubkey')
BOB_PUBKEY=$(bob getinfo | jq -r '.identity_pubkey')
CLN_PUBKEY=$(cln getinfo | jq -r '.id')

log "Alice pubkey: $ALICE_PUBKEY"
log "Bob pubkey:   $BOB_PUBKEY"
log "CLN pubkey:   $CLN_PUBKEY"

# Alice connects to Bob
alice connect "${BOB_PUBKEY}@lnd-bob:9735" 2>/dev/null || log "Alice already connected to Bob"

# CLN connects to Bob
cln connect "$BOB_PUBKEY" lnd-bob 9735 2>/dev/null || log "CLN already connected to Bob"

sleep 2

# ─── Step 4: Open channels ───────────────────────────────────────────

log "=== Step 4: Opening channels ==="

# Alice → Bob (5M sats, push 1M for some inbound liquidity)
EXISTING=$(alice listchannels 2>/dev/null | jq -r ".channels[] | select(.remote_pubkey==\"$BOB_PUBKEY\") | .chan_id" | head -1)
if [ -z "$EXISTING" ] || [ "$EXISTING" = "null" ]; then
  log "Opening Alice → Bob channel (5M sats, push 1M)..."
  alice openchannel --node_key="$BOB_PUBKEY" --local_amt=5000000 --push_amt=1000000
else
  log "Alice → Bob channel already exists: $EXISTING"
fi

# CLN → Bob (5M sats, push 1M)
EXISTING_CLN=$(cln listpeerchannels | jq -r ".channels[] | select(.peer_id==\"$BOB_PUBKEY\" and .opener==\"local\") | .short_channel_id" | head -1)
if [ -z "$EXISTING_CLN" ] || [ "$EXISTING_CLN" = "null" ]; then
  log "Opening CLN → Bob channel (5M sats, push 1M)..."
  cln fundchannel "$BOB_PUBKEY" 5000000 null null null null null 1000000
else
  log "CLN → Bob channel already exists: $EXISTING_CLN"
fi

# Mine blocks to confirm channels
btc generatetoaddress 6 "$MINER_ADDR" > /dev/null
log "Channels opening, mining confirmation blocks."

# Wait for channels to be active
log "Waiting for channels to become active..."
for i in $(seq 1 60); do
  ALICE_ACTIVE=$(alice listchannels 2>/dev/null | jq '[.channels[] | select(.active==true)] | length')
  CLN_ACTIVE=$(cln listpeerchannels 2>/dev/null | jq '[.channels[] | select(.state=="CHANNELD_NORMAL")] | length')
  if [ "${ALICE_ACTIVE:-0}" -ge 1 ] && [ "${CLN_ACTIVE:-0}" -ge 1 ]; then
    log "Channels active! Alice: $ALICE_ACTIVE, CLN: $CLN_ACTIVE"
    break
  fi
  [ "$i" -eq 60 ] && log "WARNING: Channels may not be fully active yet"
  sleep 2
done

# Extra blocks for gossip propagation
btc generatetoaddress 6 "$MINER_ADDR" > /dev/null

# ─── Step 5: Extract credentials ─────────────────────────────────────

log "=== Step 5: Extracting credentials ==="

# LND Alice macaroon (hex) and TLS cert (base64)
ALICE_MACAROON_HEX=$(docker compose -f "$COMPOSE_FILE" exec -T lnd-alice \
  xxd -p -c 10000 /root/.lnd/data/chain/bitcoin/regtest/admin.macaroon)
ALICE_TLS_CERT_B64=$(docker compose -f "$COMPOSE_FILE" exec -T lnd-alice \
  base64 -w 0 /root/.lnd/tls.cert)

# CLN gRPC mTLS certs (base64-encoded)
CLN_CA_CERT_B64=$(docker compose -f "$COMPOSE_FILE" exec -T cln \
  base64 -w 0 /root/.lightning/regtest/ca.pem 2>/dev/null || echo "")
CLN_CLIENT_CERT_B64=$(docker compose -f "$COMPOSE_FILE" exec -T cln \
  base64 -w 0 /root/.lightning/regtest/client.pem 2>/dev/null || echo "")
CLN_CLIENT_KEY_B64=$(docker compose -f "$COMPOSE_FILE" exec -T cln \
  base64 -w 0 /root/.lightning/regtest/client-key.pem 2>/dev/null || echo "")

# ─── Step 6: Write environment file ──────────────────────────────────

log "=== Step 6: Writing environment file ==="

cat > "$ENV_FILE" <<EOF
# Auto-generated by init-regtest.sh — do not edit
# Generated at: $(date -u +%Y-%m-%dT%H:%M:%SZ)

# LND Alice (payer) — bolt402 LND client connects here
LND_GRPC_HOST=https://localhost:10009
LND_REST_HOST=https://localhost:8080
LND_MACAROON_HEX=${ALICE_MACAROON_HEX}
LND_TLS_CERT_BASE64=${ALICE_TLS_CERT_B64}
LND_PUBKEY=${ALICE_PUBKEY}

# CLN (payer) — bolt402 CLN client connects here
CLN_GRPC_HOST=https://localhost:9736
CLN_CA_CERT_BASE64=${CLN_CA_CERT_B64}
CLN_CLIENT_CERT_BASE64=${CLN_CLIENT_CERT_B64}
CLN_CLIENT_KEY_BASE64=${CLN_CLIENT_KEY_B64}
CLN_PUBKEY=${CLN_PUBKEY}

# LND Bob (receiver) — used by Aperture
BOB_PUBKEY=${BOB_PUBKEY}

# L402 Server (Aperture proxy)
L402_SERVER_URL=http://localhost:8081

# Bitcoin
BITCOIND_RPC_URL=http://localhost:18443
EOF

log "=== Environment written to $ENV_FILE ==="
log ""
log "Summary:"
log "  Alice (payer, LND):   $ALICE_PUBKEY"
log "  Bob (receiver, LND):  $BOB_PUBKEY"
log "  CLN (payer):          $CLN_PUBKEY"
log "  L402 server:          http://localhost:8081 (Aperture → backend)"
log "  Alice gRPC:           https://localhost:10009"
log "  Alice REST:           https://localhost:8080"
log "  CLN gRPC:             https://localhost:9736"
log ""
log "=== Regtest environment ready! ==="
