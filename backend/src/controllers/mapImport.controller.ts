import type { NextFunction, Request, Response } from 'express';
import * as mapImportService from '../services/mapImport.service';
import type { FolderChoice } from '../types/mapImport.types';
import { AppError } from '../utils/AppError';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// POST /api/map-import/preview  (admin only, multipart form)
// Fields: file (.kml/.kmz), country ("YE": the file's main country)
export async function previewMap(req: Request, res: Response, next: NextFunction) {
  try {
    const { file, fileName } = readFile(req);
    res.json(await mapImportService.previewMap(file, fileName, readCountry(req.body)));
  } catch (err) {
    next(err);
  }
}

// POST /api/map-import  (admin only, multipart form)
// Fields: file, country, date ("2026-11-19"), choices (JSON text: [{ index: 0, action: "bases", typeCode: "airport" }, …])
export async function importMap(req: Request, res: Response, next: NextFunction) {
  try {
    const { file, fileName } = readFile(req);
    const result = await mapImportService.importMap(
      { file, fileName, country: readCountry(req.body), date: readDate(req.body), choices: readChoices(req.body) },
      res.locals.adminId,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// ---------- Reading the form ----------

function readFile(req: Request): { file: Buffer; fileName: string } {
  if (!req.file) throw AppError.badRequest('Choose a .kml or .kmz file');
  const fileName = req.file.originalname.toLowerCase();
  if (!fileName.endsWith('.kml') && !fileName.endsWith('.kmz')) {
    throw AppError.badRequest('Only .kml and .kmz files are allowed');
  }
  return { file: req.file.buffer, fileName };
}

function readCountry(body: any): string {
  const country = typeof body?.country === 'string' ? body.country.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(country)) throw AppError.badRequest('Choose the country of the map');
  return country;
}

function readDate(body: any): string {
  const date = typeof body?.date === 'string' ? body.date : '';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime())) {
    throw AppError.badRequest('date must look like 2026-11-19');
  }
  if (parsed.getTime() > Date.now() + ONE_DAY_MS) throw AppError.badRequest('date cannot be in the future');
  return date;
}

// A form can only send text, so the choices arrive as JSON text
function readChoices(body: any): FolderChoice[] {
  let choices: unknown;
  try {
    choices = JSON.parse(typeof body?.choices === 'string' ? body.choices : '');
  } catch {
    throw AppError.badRequest('choices must be a JSON list');
  }
  if (!Array.isArray(choices) || choices.length === 0) throw AppError.badRequest('choices must be a JSON list');
  return choices as FolderChoice[];
}