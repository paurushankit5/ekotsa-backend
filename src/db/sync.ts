import "dotenv/config";
import { sequelize, User } from "./models/index.js";

async function sync() {
  // Touch models so they register before sync.
  void User;
  await sequelize.sync();
  console.log("[ekotsa-backend] database synced");
  await sequelize.close();
}

sync().catch(async (error) => {
  console.error("[ekotsa-backend] database sync failed", error);
  await sequelize.close().catch(() => undefined);
  process.exit(1);
});
