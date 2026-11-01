import { Router } from 'express';
import { createSide, getSides } from '../controllers/sides.controller';
import { requireAdmin } from '../utils/requireAdmin';

export const sidesRoutes = Router();

sidesRoutes.get('/', getSides); // public
sidesRoutes.post('/', requireAdmin, createSide); // admin only