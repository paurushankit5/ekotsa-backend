import { AppError } from "../../middleware/errorHandler.js";
import { UserModel, type UserRecord } from "./user.model.js";

function toPublicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const UserService = {
  async listUsers(limit?: number) {
    const users = await UserModel.list(limit);
    return users.map(toPublicUser);
  },

  async getUserById(id: string) {
    const user = await UserModel.findById(id);
    if (!user) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }
    return toPublicUser(user);
  },

  async createUser(input: { email: string; name?: string }) {
    const existing = await UserModel.findByEmail(input.email);
    if (existing) {
      throw new AppError(409, "Email already registered", "EMAIL_TAKEN");
    }

    const user = await UserModel.create({
      email: input.email,
      name: input.name,
    });

    return toPublicUser(user);
  },
};
