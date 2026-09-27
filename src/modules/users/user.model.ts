import { User, type UserRole } from "../../db/models/index.js";

export type { UserRole };

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserInput = {
  email: string;
  passwordHash?: string | null;
  name?: string | null;
  role?: UserRole;
};

function toRecord(user: User): UserRecord {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const UserModel = {
  async findById(id: string): Promise<UserRecord | null> {
    const user = await User.findByPk(id);
    return user ? toRecord(user) : null;
  },

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await User.findOne({ where: { email: email.toLowerCase() } });
    return user ? toRecord(user) : null;
  },

  async list(limit = 50): Promise<UserRecord[]> {
    const users = await User.findAll({
      limit,
      order: [["createdAt", "DESC"]],
    });
    return users.map(toRecord);
  },

  async create(input: CreateUserInput): Promise<UserRecord> {
    const user = await User.create({
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash ?? null,
      name: input.name ?? null,
      role: input.role ?? "USER",
    });
    return toRecord(user);
  },
};
