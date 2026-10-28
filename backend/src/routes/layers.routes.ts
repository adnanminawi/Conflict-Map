import { Router } from 'express';
import { getLayers, getLayerVersions, importLayer, deleteLayerVersion } from '../controllers/layers.controller';
import { requireAdmin } from '../utils/requireAdmin';
import { upload } from '../utils/upload';

export const layersRoutes = Router();

// Public
layersRoutes.get('/', getLayers);

// Admin only. requireAdmin runs before upload, so files from strangers are never read.
layersRoutes.get('/versions', requireAdmin, getLayerVersions);
layersRoutes.post('/import', requireAdmin, upload.single('file'), importLayer);
layersRoutes.delete('/:id', requireAdmin, deleteLayerVersion);