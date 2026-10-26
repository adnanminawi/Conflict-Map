import * as eventsRepository from '../repositories/events.repository';
import type { CreateEventInput,EventStatus  } from '../types/events.types';
import { AppError } from '../utils/AppError';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getPublicEvents(days: number) {
  const since = new Date(Date.now() - days * DAY_MS);
  return eventsRepository.findConfirmedSince(since);
}

export async function getEventTypes() {
  return eventsRepository.findTypes();
}

export async function createEvent(input: CreateEventInput, adminId: number) {
  try {
    const id = await eventsRepository.insert(input, adminId);
    return { id };
  } catch (err: any) {
    if (err?.code === 'ER_NO_REFERENCED_ROW_2') {
      const msg: string = err.sqlMessage ?? '';
      if (msg.includes('fk_events_type')) throw AppError.badRequest('event_type_id does not exist');
      if (msg.includes('fk_events_location')) throw AppError.badRequest('location_id does not exist');
      if (msg.includes('fk_events_created_by')) throw AppError.badRequest('admin does not exist');
      throw AppError.badRequest('A linked record does not exist');
    }
    throw err;
  }
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
