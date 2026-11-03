import { Router } from 'express';
import {
  createWeapon,
  deleteWeapon,
  getWeapon,
  getWeapons,
  getWeaponTypes,
  updateWeapon,
} from '../controllers/weapons.controller';
import { requireAdmin } from '../utils/requireAdmin';

export const weaponsRoutes = Router();

// Public
weaponsRoutes.get('/', getWeapons);
weaponsRoutes.get('/types', getWeaponTypes); // before '/:id', or "types" would be read as an id
weaponsRoutes.get('/:id', getWeapon);

// Admin only
weaponsRoutes.post('/', requireAdmin, createWeapon);
weaponsRoutes.put('/:id', requireAdmin, updateWeapon);
weaponsRoutes.delete('/:id', requireAdmin, deleteWeapon);