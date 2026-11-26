import * as weaponsRepository from '../repositories/weapons.repository';
import * as sidesRepository from '../repositories/sides.repository';
import * as locationsRepository from '../repositories/locations.repository';
import { makeSystemFinder } from '../utils/systemMatch';
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

// After an air defence / radar system is added or renamed: the sites of its country that have no system yet
// and are named after it get linked to it. Imported "SA-2" sites → the new "S-75", so their range shows.
// Returns how many sites got linked.
async function linkSites(weapon: Weapon): Promise<number> {
  if (weapon.type_code !== 'air_defence' && weapon.type_code !== 'radar') return 0;
  const findSystem = makeSystemFinder([weapon]);
  const sites = await locationsRepository.findUnlinkedSites(weapon.country_code, weapon.type_code);
  const ids = sites
    .filter((site) => findSystem([site.name, site.description], weapon.type_code, [weapon.country_code]) !== null)
    .map((site) => site.id);
  if (ids.length > 0) await locationsRepository.setWeapon(ids, weapon.id);
  return ids.length;
}

// Returns the saved weapon (with its type and side), so the admin list can show it right away
export async function createWeapon(input: WeaponInput): Promise<Weapon> {
  await checkWeapon(input);

  const id = await weaponsRepository.insert(input);
  if (id === null) throw AppError.conflict(`${input.countryCode} already has a weapon called "${input.name}"`);
  const weapon = await getWeapon(id);
  return { ...weapon, linked_sites: await linkSites(weapon) };
}

export async function updateWeapon(id: number, input: WeaponInput): Promise<Weapon> {
  await checkWeapon(input);

  const result = await weaponsRepository.update(id, input);
  if (result === 'not_found') throw AppError.notFound('Weapon not found');
  if (result === 'duplicate') throw AppError.conflict(`${input.countryCode} already has a weapon called "${input.name}"`);
  const weapon = await getWeapon(id);
  return { ...weapon, linked_sites: await linkSites(weapon) };
}

export async function deleteWeapon(id: number): Promise<void> {
  const deleted = await weaponsRepository.deleteById(id);
  if (deleted === 0) throw AppError.notFound('Weapon not found');
}