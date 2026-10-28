#!/usr/bin/env bash
# Development-only C2PA signing certificate (ES256): a private root CA, an
# intermediate and a signing certificate. Output goes to .c2pa-dev/ (gitignored).
# Content signed with it shows as "unrecognised signer" in verifiers; production
# needs a certificate from a CA on the C2PA trust list.
set -euo pipefail
out="${1:-.c2pa-dev}"
mkdir -p "$out"
cd "$out"

cat > ext.cnf <<'CNF'
[root]
basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash

[inter]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid

[leaf]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = emailProtection
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
CNF

key() { openssl ecparam -name prime256v1 -genkey -noout -out "$1"; }
key root.key && key inter.key && key signer.key

openssl req -new -x509 -key root.key -subj "/CN=Story to Film Dev Root/O=Story to Film (development)" -days 3650 -sha256 -extensions root -config ext.cnf -out root.pem
openssl req -new -key inter.key -subj "/CN=Story to Film Dev Intermediate/O=Story to Film (development)" -out inter.csr
openssl x509 -req -in inter.csr -CA root.pem -CAkey root.key -CAcreateserial -days 1825 -sha256 -extfile ext.cnf -extensions inter -out inter.pem
openssl req -new -key signer.key -subj "/CN=Story to Film Dev Signer/O=Story to Film (development)" -out signer.csr
openssl x509 -req -in signer.csr -CA inter.pem -CAkey inter.key -CAcreateserial -days 365 -sha256 -extfile ext.cnf -extensions leaf -out signer.pem

# Chain for signing: signer first, then intermediate (root excluded).
cat signer.pem inter.pem > chain.pem
openssl pkcs8 -topk8 -nocrypt -in signer.key -out signer.pkcs8.key
rm -f ./*.csr ./*.srl
echo "C2PA_CERT_CHAIN=$(pwd)/chain.pem"
echo "C2PA_PRIVATE_KEY=$(pwd)/signer.pkcs8.key"
