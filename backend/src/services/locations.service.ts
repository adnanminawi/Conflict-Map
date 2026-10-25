import * as locationsRepository from '../repositories/locations.repository';

export async function getLocations() {
  return locationsRepository.findAll();
}