#!/usr/bin/env bash
# gen-lnd-tls.sh — Generate proper TLS certs for LND nodes (CA + server cert).
#
# LND's auto-generated certs have CA:TRUE + keyCertSign, which rustls/webpki
# rejects as end-entity certs. This script creates a proper CA → server cert
# chain that works with standard TLS verification.
#
# Usage: ./gen-lnd-tls.sh <output-dir>
# Creates: ca.pem, alice-tls.cert, alice-tls.key, bob-tls.cert, bob-tls.key

set -euo pipefail

OUTDIR="${1:-$(dirname "$0")/../lnd/tls}"
mkdir -p "$OUTDIR"

# Skip if certs already exist
if [ -f "$OUTDIR/ca.pem" ] && [ -f "$OUTDIR/alice-tls.cert" ] && [ -f "$OUTDIR/bob-tls.cert" ]; then
    echo "[gen-lnd-tls] Certs already exist in $OUTDIR, skipping."
    exit 0
fi

echo "[gen-lnd-tls] Generating TLS certificates in $OUTDIR"

# --- CA ---
openssl ecparam -genkey -name prime256v1 -out "$OUTDIR/ca.key" 2>/dev/null
openssl req -new -x509 -key "$OUTDIR/ca.key" -out "$OUTDIR/ca.pem" \
    -days 3650 -subj "/CN=lnd-regtest-ca" 2>/dev/null

# --- Alice server cert ---
openssl ecparam -genkey -name prime256v1 -out "$OUTDIR/alice-tls.key" 2>/dev/null
openssl req -new -key "$OUTDIR/alice-tls.key" -out "$OUTDIR/alice.csr" \
    -subj "/CN=lnd-alice" 2>/dev/null

cat > "$OUTDIR/alice-ext.cnf" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost,DNS:lnd-alice,IP:127.0.0.1,IP:0.0.0.0
EOF

openssl x509 -req -in "$OUTDIR/alice.csr" -CA "$OUTDIR/ca.pem" -CAkey "$OUTDIR/ca.key" \
    -CAcreateserial -out "$OUTDIR/alice-tls.cert" -days 3650 \
    -extfile "$OUTDIR/alice-ext.cnf" 2>/dev/null

# --- Bob server cert ---
openssl ecparam -genkey -name prime256v1 -out "$OUTDIR/bob-tls.key" 2>/dev/null
openssl req -new -key "$OUTDIR/bob-tls.key" -out "$OUTDIR/bob.csr" \
    -subj "/CN=lnd-bob" 2>/dev/null

cat > "$OUTDIR/bob-ext.cnf" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost,DNS:lnd-bob,IP:127.0.0.1,IP:0.0.0.0
EOF

openssl x509 -req -in "$OUTDIR/bob.csr" -CA "$OUTDIR/ca.pem" -CAkey "$OUTDIR/ca.key" \
    -CAcreateserial -out "$OUTDIR/bob-tls.cert" -days 3650 \
    -extfile "$OUTDIR/bob-ext.cnf" 2>/dev/null

# Cleanup CSRs and temp files
rm -f "$OUTDIR"/*.csr "$OUTDIR"/*.cnf "$OUTDIR"/*.srl

echo "[gen-lnd-tls] Done. Generated: ca.pem, alice-tls.{cert,key}, bob-tls.{cert,key}"
