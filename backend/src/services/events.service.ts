import * as eventsRepository from '../repositories/events.repository';
import { checkCountry } from './countries.service';
import type { CreateEventInput, EventStatus } from '../types/events.types';
import { AppError } from '../utils/AppError';
import { FOREIGN_KEY_VIOLATION } from '../config/db';

const DAY_MS = 24 * 60 * 60 * 1000;

// Public map: confirmed events from the last `days` days.
export async function getPublicEvents(days: number) {
  const since = new Date(Date.now() - days * DAY_MS);
  return eventsRepository.findConfirmedSince(since);
}

// Admin form: list of event types
export async function getEventTypes() {
  return eventsRepository.findTypes();
}

// Admin: create an event.
export async function createEvent(input: CreateEventInput, adminId: number) {
  await checkCountry(input.country_code);
  try {
    const id = await eventsRepository.insert(input, adminId);
    return { id };
  } catch (err: any) {
    throw linkError(err);
  }
}

// Admin: change one event (moved on the map, other type, new title…). Its status stays as it is.
export async function updateEvent(id: number, input: Omit<CreateEventInput, 'status'>, keepTarget: boolean) {
  await checkCountry(input.country_code);
  let changed: number;
  try {
    changed = await eventsRepository.update(id, input, keepTarget);
  } catch (err: any) {
    throw linkError(err);
  }
  if (changed === 0) throw AppError.notFound('Event not found');
}

// A wrong id in a link (type, target, admin) → a clear 400 instead of a database error
function linkError(err: any) {
  if (err?.code === FOREIGN_KEY_VIOLATION) {
    const constraint: string = err.constraint ?? ''; // Postgres names the broken link, e.g. "fk_events_type"
    if (constraint === 'fk_events_type') return AppError.badRequest('event_type_id does not exist');
    if (constraint === 'fk_events_location') return AppError.badRequest('location_id does not exist');
    if (constraint === 'fk_events_created_by') return AppError.badRequest('admin does not exist');
    return AppError.badRequest('A linked record does not exist');
  }
  return err;
}

// Admin: list of recent events, optionally filtered by status
export async function getAdminEvents(status?: EventStatus) {
  return eventsRepository.findRecentForAdmin(status);
}

// Admin: confirm / mark false / back to unverified
export async function setEventStatus(id: number, status: EventStatus) {
  const changed = await eventsRepository.updateStatus(id, status);
  if (changed === 0) throw AppError.notFound('Event not found');
}

// Admin: delete an event
export async function deleteEvent(id: number) {
  const deleted = await eventsRepository.deleteById(id);
  if (deleted === 0) throw AppError.notFound('Event not found');
}
