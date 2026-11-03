import { Router } from 'express';
import { getCountries } from '../controllers/countries.controller';

export const countriesRoutes = Router();

countriesRoutes.get('/', getCountries); // public