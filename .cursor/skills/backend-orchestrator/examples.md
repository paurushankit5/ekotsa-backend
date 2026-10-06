# Backend Orchestrator — Examples

## Example: create user (orchestrated)

### Controller — HTTP + request validation only

```ts
// user.controller.ts
async create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createUserSchema.parse(req.body);
    const user = await UserService.createUser(body);
    res.status(201).json({ ok: true, data: { user } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues.map((i) => i.message).join("; "),
        },
      });
      return;
    }
    next(error);
  }
}
```

### Service — orchestration only

```ts
// user.service.ts
export const UserService = {
  async createUser(input: { email: string; name?: string }) {
    const existing = await findUserByEmail(input.email);
    assertEmailAvailable(existing);
    const user = await insertUser(input);
    return toPublicUser(user);
  },
};
```

### Helpers — real work

```ts
// user.helpers.ts
export async function findUserByEmail(email: string) {
  return UserModel.findByEmail(email);
}

export function assertEmailAvailable(existing: UserRecord | null) {
  if (existing) {
    throw new AppError(409, "Email already registered", "EMAIL_TAKEN");
  }
}

export async function insertUser(input: { email: string; name?: string }) {
  return UserModel.create(input);
}

export function toPublicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
```

## Anti-example: fat service (do not write)

```ts
// ❌ Everything inline — hard to test, reuse, or read as a workflow
async createUser(input: { email: string; name?: string }) {
  const existing = await sequelize.query(/* ... */);
  if (existing.length) {
    throw new AppError(409, "Email already registered", "EMAIL_TAKEN");
  }
  const id = crypto.randomUUID();
  await sequelize.query(/* insert ... */);
  const rows = await sequelize.query(/* select ... */);
  // email HTML, retries, etc. all here...
  return { id, email: input.email /* ... */ };
}
```

## Multi-step side effects

When a flow needs notify / storage / billing after write:

```ts
async registerDevice(input: RegisterDeviceInput) {
  const org = await getOrganization(input.orgId);
  assertOrgActive(org);
  const device = await insertDevice(input);
  await enqueueDeviceProvisionedEvent(device);
  return toPublicDevice(device);
}
```

Each line is a helper. The service does not implement provision, email, or SQL.
