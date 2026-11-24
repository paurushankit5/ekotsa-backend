import type { Migration } from "./types.js";
import { DataTypes, addColumnIfNotExists, removeColumnIfExists } from "./helpers.js";

const migration: Migration = {
  id: "202611190001_auth_exchange_security",
  async up({ queryInterface }) {
    await addColumnIfNotExists(queryInterface, "password_reset_otps", "purpose", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "PASSWORD_RESET",
    });
    await addColumnIfNotExists(queryInterface, "password_reset_otps", "usedAt", {
      type: DataTypes.DATE,
      allowNull: true,
    });
    for (const [name, options] of [
      ["browserExchangeCodeHash", { type: DataTypes.STRING, allowNull: true }],
      ["browserExchangeExpiresAt", { type: DataTypes.DATE, allowNull: true }],
      ["browserExchangeConsumedAt", { type: DataTypes.DATE, allowNull: true }],
      ["adminExchangeCodeHash", { type: DataTypes.STRING, allowNull: true }],
      ["adminExchangeExpiresAt", { type: DataTypes.DATE, allowNull: true }],
      ["adminExchangeConsumedAt", { type: DataTypes.DATE, allowNull: true }],
    ] as const) {
      await addColumnIfNotExists(queryInterface, "google_oauth_transactions", name, options);
    }
  },
  async down({ queryInterface }) {
    for (const name of ["adminExchangeConsumedAt", "adminExchangeExpiresAt", "adminExchangeCodeHash", "browserExchangeConsumedAt", "browserExchangeExpiresAt", "browserExchangeCodeHash"]) {
      await removeColumnIfExists(queryInterface, "google_oauth_transactions", name);
    }
    await removeColumnIfExists(queryInterface, "password_reset_otps", "usedAt");
    await removeColumnIfExists(queryInterface, "password_reset_otps", "purpose");
  },
};

export default migration;
