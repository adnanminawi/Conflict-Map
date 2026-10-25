import { Router } from 'express';
import { getLocations } from '../controllers/locations.controller';

export const locationsRoutes = Router();

locationsRoutes.get('/', getLocations); // public