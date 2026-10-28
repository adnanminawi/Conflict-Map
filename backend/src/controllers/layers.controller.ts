import type { Request, Response, NextFunction } from 'express';
import * as layersService from '../services/layers.service';
import { AppError } from '../utils/AppError';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// GET /api/layers — the newest version of every layer (public map)
export async function getLayers(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await layersService.getLatestLayers());
  } catch (err) {
    next(err);
  }
}

// GET /api/layers/versions — every saved version (admin only)
export async function getLayerVersions(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await layersService.getLayerVersions());
  } catch (err) {
    next(err);
  }
}

// POST /api/layers/import  (admin only, multipart form)
// Fields: file (.kml/.kmz), name (e.g. "Yemen frontlines"), date ("YYYY-MM-DD")
export async function importLayer(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file; // added by multer
    if (!file) throw AppError.badRequest('Choose a .kml or .kmz file');

    const fileName = file.originalname.toLowerCase();
    if (!fileName.endsWith('.kml') && !fileName.endsWith('.kmz')) {
      throw AppError.badRequest('Only .kml and .kmz files are allowed');
    }

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 1 || name.length > 150) {
      throw AppError.badRequest('Layer name is required (max 150 characters)');
    }

    const date = typeof req.body.date === 'string' ? req.body.date : '';
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime())) {
      throw AppError.badRequest('date must look like 2026-10-24');
    }
    if (parsedDate.getTime() > Date.now() + ONE_DAY_MS) {
      throw AppError.badRequest('date cannot be in the future');
    }

    const result = await layersService.importLayer(
      { file: file.buffer, fileName, name, snapshotDate: date },
      res.locals.adminId,
    );
    res.status(result.replaced ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/layers/:id  (admin only) — deletes one version
export async function deleteLayerVersion(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw AppError.badRequest('Invalid layer id');
    await layersService.deleteLayerVersion(id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}