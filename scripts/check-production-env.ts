/**
 * Validate an environment for production WITHOUT starting the server.
 *   npm run check:env:production                       # uses .env + process env
 *   npm run check:env:production -- --env-file=prod.env
 * Prints variable names and problems only — never secret values.
 */
import { config as loadDotenv } from "dotenv";

async function main() {
  const fileArg = process.argv.find((a) => a.startsWith("--env-file="));
  loadDotenv({ path: fileArg ? fileArg.slice("--env-file=".length) : ".env", override: Boolean(fileArg) });
  process.env.NODE_ENV = "production";

  const { loadEnv } = await import("../src/config/env.js");
  const { collectProductionIssues } = await import("../src/config/production-checks.js");

  let env;
  try {
    env = loadEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  const { errors, warnings } = collectProductionIssues(env);
  for (const w of warnings) console.warn(`WARN  ${w.variable}: ${w.message}`);
  for (const e of errors) console.error(`ERROR ${e.variable}: ${e.message}`);
  if (errors.length) {
    console.error(`\nPRODUCTION configuration INVALID (${errors.length} error${errors.length === 1 ? "" : "s"}).`);
    process.exit(1);
  }
  console.log("PRODUCTION configuration PASS.");
}

void main();
