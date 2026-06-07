#!/bin/bash
# ============================================================
#  sign-license.sh
#  Mint a per-client license bound to one machine's HOST_ID.
#
#  USAGE (UUID only):
#    ./sign-license.sh "4C4C4544-0034-5910-8052-XXXXXXXXXXXX"
#
#  USAGE (UUID + BIOS serial, more robust):
#    ./sign-license.sh "4C4C4544-0034-...|MYSERIAL123"
#
#  Run this from the folder that contains license_private.pem.
#  Output: license.key  -> send this file to the client.
# ============================================================

if [ -z "$1" ]; then
  echo "Usage: ./sign-license.sh \"<HOST_ID>\""
  echo "  HOST_ID is the UUID, or \"UUID|SERIAL\" if you bind both."
  exit 1
fi

if [ ! -f license_private.pem ]; then
  echo "ERROR: license_private.pem not found in this folder."
  echo "Run from your license-keys folder, or generate the key first:"
  echo "  openssl genrsa -out license_private.pem 2048"
  exit 1
fi

# Normalize EXACTLY the same way licenseCheck.js does:
# uppercase, then keep only 0-9, A-F, and the pipe '|'.
NORM=$(echo "$1" | tr 'a-z' 'A-Z' | tr -cd '0-9A-F|')

echo "Normalized HOST_ID: $NORM"

printf '%s' "$NORM" > _hostid.tmp
openssl dgst -sha256 -sign license_private.pem _hostid.tmp | base64 -w0 > license.key
rm -f _hostid.tmp

echo "----------------------------------------------------"
echo "license.key created in this folder."
echo "Send license.key to the client. It ONLY works on the"
echo "machine whose HOST_ID you signed above."
echo "----------------------------------------------------"
