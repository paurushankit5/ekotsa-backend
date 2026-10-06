---
name: backend-orchestrator
description: >-
  Enforce Controller → Service (orchestrator) → Helpers layering for Ekotsa
  backend modules. Controllers own HTTP, request validation, and error mapping.
  Services stay thin and only orchestrate step order. Helpers (and models) own
  real work: DB access, domain checks, side effects. Use when writing or
  refactoring routes, controllers, services, helpers, or any backend module
  endpoint in ekotsa-backend.
---

# Backend Orchestrator Pattern

Apply this layering for every new or changed backend feature.

```
Route → Controller → Service (orchestrator) → Helpers / Models
```

## Layer responsibilities

| Layer | Owns | Does not own |
|-------|------|--------------|
| **Controller** | HTTP in/out, request schema validation (Zod), status codes, mapping errors to responses, calling one service method | Business logic, DB queries, email/storage/side effects, multi-step workflows |
| **Service** | Step order only: call helpers in sequence, pass results between steps, throw domain `AppError`s when a step should abort | Inline DB/SQL, email bodies, heavy validation logic, HTTP concerns |
| **Helpers** | Single-purpose work units: fetch, domain validate, insert/update, send email, transform, external API calls | Deciding overall workflow order; HTTP |
| **Model / DB** | Persistence primitives | Orchestration or HTTP |

Versioning (API version folders, dual handlers) is out of scope for now — leave room but do not invent it unless asked.

## Hard rules

1. **Service methods are orchestrators.** Prefer ~3–6 sequential calls. If a service method grows past ~15 lines of real logic, extract into helpers.
2. **No business work inside the controller.** Parse → call service → shape response → `next(error)`.
3. **Helpers are verbs.** Name them by action: `findUserByEmail`, `assertEmailAvailable`, `insertUser`, `sendWelcomeEmail`.
4. **One helper = one responsibility.** Do not hide a second workflow inside a helper.
5. **Domain failures throw `AppError`** from service or helpers; controllers do not invent business error codes mid-flow (except Zod → 400).
6. **Match existing module layout:** `*.routes.ts`, `*.controller.ts`, `*.service.ts`, plus `*.helpers.ts` (or `helpers/`) when logic appears.

## Service shape (target)

```ts
export const ExampleService = {
  async createThing(input: CreateThingInput) {
    const existing = await findThingByKey(input.key);
    assertThingAvailable(existing);
    const thing = await insertThing(input);
    await sendThingCreatedEmail(thing);
    return toPublicThing(thing);
  },
};
```

That method should read as a checklist: get → validate → write → notify. Implementation lives in helpers.

## Controller shape (target)

```ts
export const ExampleController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = createThingSchema.parse(req.body);
      const thing = await ExampleService.createThing(body);
      res.status(201).json({ ok: true, data: { thing } });
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
  },
};
```

## File layout per module

```
src/modules/<feature>/
  <feature>.routes.ts
  <feature>.controller.ts
  <feature>.service.ts
  <feature>.helpers.ts      # or helpers/*.ts when it grows
  <feature>.model.ts        # if persistence-specific
```

Split helpers by concern only when a single helpers file becomes hard to scan (e.g. `helpers/email.ts`, `helpers/db.ts`).

## Anti-patterns (reject / refactor)

- Fat service with nested `if` trees, loops, and SQL mixed together
- Controller calling models or helpers directly (skipping the service)
- Service importing Express `Request` / `Response`
- “God helper” that runs the whole workflow
- Duplicating Zod validation inside the service for the same request body (request shape stays in controller; domain invariants stay in helpers/service)

## When implementing a feature

1. Define the route and controller method (validate + respond).
2. Write the service method as an ordered list of helper calls first (even as stubs).
3. Implement each helper with a single job.
4. Wire errors via `AppError` / existing `errorHandler`.
5. Keep public response shaping in a small mapper helper if needed (`toPublicX`).

## Additional resources

- Concrete before/after examples: [examples.md](examples.md)
