import * as eventsRepository from '../repositories/events.repository';
import type { CreateEventInput } from '../types/events.types';
import { AppError } from '../utils/AppError';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getPublicEvents(days: number) {
  const since = new Date(Date.now() - days * DAY_MS);
  return eventsRepository.findConfirmedSince(since);
}
export async function createEvent(input: CreateEventInput, adminId: number) {
  try {
    const id = await eventsRepository.insert(input, adminId);
    return { id };
  } catch (err: any) {
    // event_type_id or location_id points to a row that doesn't exist
    if (err?.code === 'ER_NO_REFERENCED_ROW_2') {
      throw AppError.badRequest('event_type_id or location_id does not exist');
    }
    throw err;
  }
}
