#!/usr/bin/env bash
# Web Push uchun VAPID kalit juftini yaratadi.
# Serverga faqat MAXFIY kalit (VAPID_PRIVATE_KEY) kerak — ochiq kalit undan hosil bo'ladi.
#
# Ishlatish:  scripts/genvapid.sh
set -euo pipefail

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

openssl ecparam -name prime256v1 -genkey -noout -out "$tmp/vp.pem" 2>/dev/null

python3 - "$tmp/vp.pem" <<'PY'
import subprocess, base64, re, sys
pem = sys.argv[1]
a = subprocess.run(["openssl","asn1parse","-in",pem],capture_output=True,text=True).stdout
priv = bytes.fromhex(re.findall(r'OCTET STRING.*?([0-9A-F]{64})', a)[0])
der = subprocess.run(["openssl","ec","-in",pem,"-pubout","-outform","DER"],capture_output=True).stdout
pub = der[-65:]
b = lambda x: base64.urlsafe_b64encode(x).rstrip(b'=').decode()
print("VAPID_PRIVATE_KEY=" + b(priv))
print("# (ochiq kalit — ma'lumot uchun; server avtomatik hosil qiladi)")
print("# VAPID_PUBLIC_KEY=" + b(pub))
PY
