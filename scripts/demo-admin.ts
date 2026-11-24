/**
 * Local-only demo ADMIN account lifecycle.
 *
 * Enable setup with:
 *   LOCAL_DEMO_ADMIN_ENABLED=true
 *   DEMO_ADMIN_CONFIRM_DISPOSABLE=true
 *   NODE_ENV=development
 *   npx tsx scripts/demo-admin.ts enable
 *
 * The generated password is printed exactly once by this command and is never
 * returned by the API or written to application logs.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { User, sequelize } from "../src/db/models/index.js";
import { loadEnv } from "../src/config/env.js";
import { hashPassword } from "../src/modules/auth/auth.crypto.js";
import { LOCAL_DEMO_ADMIN_EMAIL } from "../src/modules/auth/auth.service.js";

function requireLocalDemoMode() {
  const env = loadEnv();
  if (env.NODE_ENV === "production") throw new Error("Demo ADMIN is disabled in production.");
  if (!env.LOCAL_DEMO_ADMIN_ENABLED || !env.DEMO_ADMIN_CONFIRM_DISPOSABLE) {
    throw new Error("Enable LOCAL_DEMO_ADMIN_ENABLED and DEMO_ADMIN_CONFIRM_DISPOSABLE for a disposable local database.");
  }
  return env;
}

async function main() {
  const action = process.argv[2];
  if (!action || !["enable", "delete"].includes(action)) {
    throw new Error("Usage: npx tsx scripts/demo-admin.ts <enable|delete>");
  }
  requireLocalDemoMode();

  if (action === "delete") {
    await User.destroy({ where: { email: LOCAL_DEMO_ADMIN_EMAIL } });
    console.log("Local demo ADMIN account deleted.");
    return;
  }

  const password = randomBytes(32).toString("base64url");
  const [user] = await User.findOrCreate({
    where: { email: LOCAL_DEMO_ADMIN_EMAIL },
    defaults: {
      email: LOCAL_DEMO_ADMIN_EMAIL,
      passwordHash: await hashPassword(password),
      name: "Ekotsa Local Demo Admin",
      emailVerified: true,
      role: "ADMIN",
    },
  });
  await user.update({ passwordHash: await hashPassword(password), name: "Ekotsa Local Demo Admin", emailVerified: true, role: "ADMIN" });
  console.log("Local demo ADMIN enabled.");
  console.log(`Login ID: ${LOCAL_DEMO_ADMIN_EMAIL}`);
  console.log(`One-time password: ${password}`);
  console.log("Save this password locally; it will not be shown again by the application.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Demo ADMIN setup failed.");
  process.exitCode = 1;
}).finally(() => sequelize.close().catch(() => undefined));
