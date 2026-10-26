import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth.service';
import { AppError } from './AppError';

// Put this before any route that only admins may use:
//   eventsRoutes.post('/', requireAdmin, createEvent)
// It checks the "Authorization: Bearer <token>" header and saves the admin's id in res.locals.adminId.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw AppError.unauthorized('Please log in');

    res.locals.adminId = verifyToken(token);
    next();
  } catch (err) {
    next(err);
  }
}