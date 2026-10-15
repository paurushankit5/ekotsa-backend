import { DataTypes, type QueryInterface, type DataType } from "sequelize";

type ColumnDefinition = {
  type: DataType;
  allowNull?: boolean;
  defaultValue?: unknown;
  unique?: boolean;
  comment?: string;
};

/** Sequelize-native additive column change (skips if column already exists). */
export async function addColumnIfNotExists(
  queryInterface: QueryInterface,
  table: string,
  column: string,
  definition: ColumnDefinition,
) {
  const description = await queryInterface.describeTable(table);
  if (Object.prototype.hasOwnProperty.call(description, column)) return;
  await queryInterface.addColumn(table, column, definition);
}

/** Sequelize-native drop (skips if column is already gone). */
export async function removeColumnIfExists(
  queryInterface: QueryInterface,
  table: string,
  column: string,
) {
  const description = await queryInterface.describeTable(table);
  if (!Object.prototype.hasOwnProperty.call(description, column)) return;
  await queryInterface.removeColumn(table, column);
}

export { DataTypes };
