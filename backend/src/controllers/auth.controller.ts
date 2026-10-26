import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import { AppError } from '../utils/AppError';

// POST /api/auth/login  { username, password }
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      throw AppError.badRequest('username and password are required');
    }

    const result = await authService.login(username, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
}