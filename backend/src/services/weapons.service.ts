import * as weaponsRepository from '../repositories/weapons.repository';
import * as sidesRepository from '../repositories/sides.repository';
import type { Weapon, WeaponInput, WeaponType } from '../types/weapons.types';
import { AppError } from '../utils/AppError';
import { checkCountry } from './countries.service';

export async function getWeapons(): Promise<Weapon[]> {
  return weaponsRepository.findAll();
}

export async function getWeaponTypes(): Promise<WeaponType[]> {
  return weaponsRepository.findTypes();
}

export async function getWeapon(id: number): Promise<Weapon> {
  const weapon = await weaponsRepository.findById(id);
  if (!weapon) throw AppError.notFound('Weapon not found');
  return weapon;
}

// Used by create and update:
//   1. the weapon type must exist
//   2. the country must exist
//   3. country with sides → a side is required, and it must be one of that country's sides
//      country without sides → no side
async function checkWeapon(input: WeaponInput) {
  const types = await weaponsRepository.findTypes();
  if (!types.some((t) => t.id === input.weaponTypeId)) throw AppError.badRequest('This weapon type does not exist');

  await checkCountry(input.countryCode);

  const countrySides = await sidesRepository.findByCountry(input.countryCode);
  if (countrySides.length > 0 && input.sideId === null) {
    throw AppError.badRequest(`${input.countryCode} has sides: choose which side has this weapon`);
  }
  if (input.sideId !== null && !countrySides.some((s) => s.id === input.sideId)) {
    throw AppError.badRequest(`This side does not belong to ${input.countryCode}`);
  }
}

// Returns the saved weapon (with its type and side), so the admin list can show it right away
export async function createWeapon(input: WeaponInput): Promise<Weapon> {
  await checkWeapon(input);

  const id = await weaponsRepository.insert(input);
  if (id === null) throw AppError.conflict(`${input.countryCode} already has a weapon called "${input.name}"`);
  return getWeapon(id);
}

export async function updateWeapon(id: number, input: WeaponInput): Promise<Weapon> {
  await checkWeapon(input);

  const result = await weaponsRepository.update(id, input);
  if (result === 'not_found') throw AppError.notFound('Weapon not found');
  if (result === 'duplicate') throw AppError.conflict(`${input.countryCode} already has a weapon called "${input.name}"`);
  return getWeapon(id);
}

export async function deleteWeapon(id: number): Promise<void> {
  const deleted = await weaponsRepository.deleteById(id);
  if (deleted === 0) throw AppError.notFound('Weapon not found');
}