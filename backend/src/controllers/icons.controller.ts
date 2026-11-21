import type { NextFunction, Request, Response } from 'express';
import * as iconsService from '../services/icons.service';
import { AppError } from '../utils/AppError';

// GET /api/icons/12 — the picture of an icon (public: the map loads it for every visitor)
export async function getIcon(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw AppError.badRequest('Bad icon id');
    const icon = await iconsService.getIcon(id);

    res.set({
      'Content-Type': icon.content_type,
      'Cache-Control': 'public, max-age=31536000, immutable', // a saved picture never changes: browsers keep it a year
      'X-Content-Type-Options': 'nosniff', // the browser must treat it as the picture type, nothing else
    });
    res.send(icon.data);
  } catch (err) {
    next(err);
  }
}

// GET /api/icons (admin) — the ids of all saved icons, for the icon picker
export async function listIcons(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await iconsService.listIcons());
  } catch (err) {
    next(err);
  }
}

// POST /api/icons (admin, multipart form with "file") — a new icon picture → { id }
export async function uploadIcon(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw AppError.badRequest('Choose a picture');
    res.status(201).json(await iconsService.uploadIcon(req.file.buffer));
  } catch (err) {
    next(err);
  }
}