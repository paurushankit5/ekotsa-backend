import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const privateKeyBase64Url = Buffer.from(
  privateKey.export({ type: "pkcs8", format: "der" }),
).toString("base64url");
const publicKeyBase64Url = Buffer.from(
  publicKey.export({ type: "spki", format: "der" }),
).toString("base64url");

console.log(`# Add to ekotsa-backend .env
LICENSE_SIGNING_KEY_ID=key_dev_1
LICENSE_ISSUER_VERSION=1
LICENSE_GRACE_DAYS=7
LICENSE_MAX_OFFLINE_DAYS=30
LICENSE_TRIAL_DAYS=21

# Single-line base64url DER (recommended)
LICENSE_SIGNING_PRIVATE_KEY=${privateKeyBase64Url}
LICENSE_SIGNING_PUBLIC_KEY=${publicKeyBase64Url}

# PEM alternative (escape newlines as \\n if needed):
# LICENSE_SIGNING_PRIVATE_KEY="${privateKeyPem.replace(/\n/g, "\\n")}"
# LICENSE_SIGNING_PUBLIC_KEY="${publicKeyPem.replace(/\n/g, "\\n")}"
`);
