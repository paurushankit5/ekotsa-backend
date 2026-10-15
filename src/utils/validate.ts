import Joi from "joi";
import { AppError } from "../middleware/errorHandler.js";

export function validateOrThrow<T>(schema: Joi.Schema<T>, value: unknown): T {
  const { error, value: validated } = schema.validate(value, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    throw new AppError(
      400,
      error.details.map((detail) => detail.message).join("; "),
      "VALIDATION_ERROR",
    );
  }

  return validated as T;
}

export { Joi };
