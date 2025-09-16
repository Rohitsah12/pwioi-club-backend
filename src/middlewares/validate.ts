import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../utils/AppError.js';

export const validate = (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error: any) {
        const errorMessage = error.errors[0]?.message || 'Validation failed';
        throw new AppError(errorMessage, 400);
    }
};