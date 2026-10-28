import { Router } from 'express';
import { getLocations, getLocationTypes, importKml } from '../controllers/locations.controller';
import { requireAdmin } from '../utils/requireAdmin';
import { upload } from '../utils/upload';

export const locationsRoutes = Router();

// Public
locationsRoutes.get('/', getLocations);
locationsRoutes.get('/types', getLocationTypes);

// Admin only. requireAdmin runs first, so files from strangers are never read.
locationsRoutes.post('/import', requireAdmin, upload.single('file'), importKml);