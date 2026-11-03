import * as weaponsRepository from '../repositories/weapons.repository';
import * as sidesRepository from '../repositories/sides.repository';
import type { Weapon, WeaponInput, WeaponType } from '../types/weapons.types';
import { AppError } from '../utils/AppError';

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

// Used by create and update: the weapon type and the side must exist
async function checkTypeAndSide(input: WeaponInput) {
  const types = await weaponsRepository.findTypes();
  if (!types.some((t) => t.id === input.weaponTypeId)) throw AppError.badRequest('This weapon type does not exist');

  const side = await sidesRepository.findById(input.sideId);
  if (!side) throw AppError.badRequest('This side does not exist');
}

// Returns the saved weapon (with its type and side), so the admin list can show it right away
export async function createWeapon(input: WeaponInput): Promise<Weapon> {
  await checkTypeAndSide(input);

  const id = await weaponsRepository.insert(input);
  if (id === null) throw AppError.conflict(`This side already has a weapon called "${input.name}"`);
  return getWeapon(id);
}

export async function updateWeapon(id: number, input: WeaponInput): Promise<Weapon> {
  await checkTypeAndSide(input);

  const result = await weaponsRepository.update(id, input);
  if (result === 'not_found') throw AppError.notFound('Weapon not found');
  if (result === 'duplicate') throw AppError.conflict(`This side already has a weapon called "${input.name}"`);
  return getWeapon(id);
}

export async function deleteWeapon(id: number): Promise<void> {
  const deleted = await weaponsRepository.deleteById(id);
  if (deleted === 0) throw AppError.notFound('Weapon not found');
}