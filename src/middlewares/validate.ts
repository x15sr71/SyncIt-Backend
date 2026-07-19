import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

/**
 * Request validation middleware (P1-9). Parsed values replace the originals,
 * so handlers see trimmed/coerced data and unknown keys are stripped.
 */
export function validate(schemas: { body?: ZodType; query?: ZodType }) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (schemas.body) {
      const parsed = schemas.body.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      req.body = parsed.data;
    }

    if (schemas.query) {
      const parsed = schemas.query.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      // Express 4: req.query is assignable; keep the parsed (typed) values.
      req.query = parsed.data as any;
    }

    return next();
  };
}
