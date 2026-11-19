import { Router } from 'express';
import {
  getLayers,
  getAllLayers,
  getLayerVersions,
  saveLayer,
  importLayer,
  deleteLayerVersion,
  setLayerHidden,
} from '../controllers/layers.controller';
import { requireAdmin } from '../utils/requireAdmin';
import { upload } from '../utils/upload';

export const layersRoutes = Router();

// Public
layersRoutes.get('/', getLayers);

// Admin only. requireAdmin runs before upload, so files from strangers are never read.
layersRoutes.get('/admin', requireAdmin, getAllLayers); // the map editor: hidden layers too
layersRoutes.get('/versions', requireAdmin, getLayerVersions);
layersRoutes.post('/', requireAdmin, saveLayer); // shapes drawn in the map editor
layersRoutes.post('/import', requireAdmin, upload.single('file'), importLayer); // KML / KMZ file
layersRoutes.patch('/visibility', requireAdmin, setLayerHidden); // hide / show a layer on the public map
layersRoutes.delete('/:id', requireAdmin, deleteLayerVersion);