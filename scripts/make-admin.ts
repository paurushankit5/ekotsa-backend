/**
 * Promote a user to ADMIN by email.
 * Usage: npx tsx scripts/make-admin.ts you@example.com
 */
import "dotenv/config";
import { User, sequelize } from "../src/db/models/index.js";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npx tsx scripts/make-admin.ts <email>");
    process.exit(1);
  }

  const user = await User.findOne({ where: { email } });
  if (!user) {
    console.error(`No user found for ${email}`);
    process.exit(1);
  }

  await user.update({ role: "ADMIN" });
  console.log(`[ekotsa-backend] ${email} is now ADMIN (id=${user.id})`);
  await sequelize.close();
}

main().catch(async (error) => {
  console.error(error);
  await sequelize.close().catch(() => undefined);
  process.exit(1);
});
