import * as countriesRepository from '../repositories/countries.repository';
import type { Country } from '../types/countries.types';
import { AppError } from '../utils/AppError';

export async function getCountries(): Promise<Country[]> {
  return countriesRepository.findAll();
}

// Used before saving anything with a country (events, bases, sides): 400 if the code is not a real country
export async function checkCountry(code: string): Promise<void> {
  if (!(await countriesRepository.exists(code))) throw AppError.badRequest(`"${code}" is not a country code`);
}