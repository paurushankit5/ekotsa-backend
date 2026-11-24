// Generate an ES256 (EC P-256) key pair for signing user/admin session tokens.
// The PRIVATE key goes only into ekotsa-backend's environment. Verifiers (the website)
// fetch the PUBLIC key from GET /v1/auth/jwks and never need a secret.
import { generateKeyPairSync, randomBytes } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const privateDer = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url");
const publicDer = publicKey.export({ type: "spki", format: "der" }).toString("base64url");
const kid = `session_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${randomBytes(3).toString("hex")}`;

console.log(`# Add to ekotsa-backend .env (never to the website)
AUTH_JWT_KEY_ID=${kid}
AUTH_JWT_PRIVATE_KEY=${privateDer}

# Public key for reference / key rotation. When rotating, move the OLD key's public part into
# AUTH_JWT_PREVIOUS_PUBLIC_KEYS until every token signed with it has expired (max 7 days):
# AUTH_JWT_PREVIOUS_PUBLIC_KEYS={"${kid}":"${publicDer}"}
`);
