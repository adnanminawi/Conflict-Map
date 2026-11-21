import { Router } from 'express';
import { getIcon, listIcons, uploadIcon } from '../controllers/icons.controller';
import { requireAdmin } from '../utils/requireAdmin';
import { upload } from '../utils/upload';

export const iconsRoutes = Router();

iconsRoutes.get('/', requireAdmin, listIcons); // the icon picker's list
iconsRoutes.post('/', requireAdmin, upload.single('file'), uploadIcon); // a new picture (requireAdmin first: strangers' files are never read)
iconsRoutes.get('/:id', getIcon); // public: the map shows these icons to every visitor