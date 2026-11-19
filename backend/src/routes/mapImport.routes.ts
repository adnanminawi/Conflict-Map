import { Router } from 'express';
import { importMap, previewMap } from '../controllers/mapImport.controller';
import { requireAdmin } from '../utils/requireAdmin';
import { upload } from '../utils/upload';

export const mapImportRoutes = Router();

// Admin only. requireAdmin runs before upload, so files from strangers are never read.
mapImportRoutes.post('/preview', requireAdmin, upload.single('file'), previewMap); // step 1: guesses, saves nothing
mapImportRoutes.post('/', requireAdmin, upload.single('file'), importMap); // step 2: saves the admin's choices