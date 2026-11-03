import * as sidesRepository from '../repositories/sides.repository';
import { checkCountry } from './countries.service';
import type { NewSide, Side } from '../types/sides.types';
import { AppError } from '../utils/AppError';

export async function getSides(): Promise<Side[]> {
  return sidesRepository.findAll();
}

export async function createSide(input: NewSide): Promise<Side> {
  await checkCountry(input.countryCode);
  const id = await sidesRepository.insert(input);
  if (id === null) throw AppError.conflict(`${input.countryCode} already has a side called "${input.name}"`);
  return { id, country_code: input.countryCode, name: input.name, color: input.color };
}