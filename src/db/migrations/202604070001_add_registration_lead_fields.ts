import type { Migration } from "./types.js";
import {
  DataTypes,
  addColumnIfNotExists,
  removeColumnIfExists,
} from "./helpers.js";

/**
 * Lead-capture fields on download registrations.
 * Uses Sequelize queryInterface (not raw SQL).
 */
const migration: Migration = {
  id: "202604070001_add_registration_lead_fields",
  async up({ queryInterface }) {
    await addColumnIfNotExists(queryInterface, "customer_registrations", "industry", {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await addColumnIfNotExists(
      queryInterface,
      "customer_registrations",
      "businessAddress",
      {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    );
  },
  async down({ queryInterface }) {
    await removeColumnIfExists(queryInterface, "customer_registrations", "businessAddress");
    await removeColumnIfExists(queryInterface, "customer_registrations", "industry");
  },
};

export default migration;
