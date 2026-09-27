import { sequelize } from "../sequelize.js";
import { initUserModel, User } from "./User.js";

initUserModel(sequelize);

export { sequelize, User };
export type { UserRole } from "./User.js";
