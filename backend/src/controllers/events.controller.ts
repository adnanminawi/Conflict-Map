import type { Request, Response, NextFunction } from 'express';
import * as eventsService from '../services/events.service';
import type { CreateEventInput, EventStatus } from '../types/events.types';
import { AppError } from '../utils/AppError';

// TEMPORARY: no login yet, so every event is saved as admin 1.
// Replace with the logged-in admin's id once auth is written.

const STATUSES: EventStatus[] = ['unverified', 'confirmed', 'false'];
const FIVE_MIN_MS = 5 * 60 * 1000;

// GET /api/events — confirmed events from the last 7 days
export async function getEvents(_req: Request, res: Response, next: NextFunction) {
  try {
    const events = await eventsService.getPublicEvents(7);
    res.json(events);
  } catch (err) {
    next(err);
  }
}

// POST /api/events — create an event
export async function getEventTypes(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await eventsService.getEventTypes());
  } catch (err) {
    next(err);
  }
}

// POST /api/events — create an event (admin only; requireAdmin sets res.locals.adminId)
export async function createEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const input = readCreateEventBody(req.body);
    const result = await eventsService.createEvent(input, res.locals.adminId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// Checks the request body and returns clean, typed data. Throws 400 on bad input.
function readCreateEventBody(body: any): CreateEventInput {
  if (!body || typeof body !== 'object') throw AppError.badRequest('Body must be JSON');

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 1 || title.length > 200) {
    throw AppError.badRequest('title is required (max 200 characters)');
  }

  const description =
    typeof body.description === 'string' && body.description.trim() !== ''
      ? body.description.trim()
      : null;

  const eventTypeId = Number(body.event_type_id);
  if (!Number.isInteger(eventTypeId) || eventTypeId < 1) {
    throw AppError.badRequest('event_type_id must be a positive whole number');
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (body.lat == null || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw AppError.badRequest('lat must be a number between -90 and 90');
  }
  if (body.lng == null || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw AppError.badRequest('lng must be a number between -180 and 180');
  }

  const occurredAt = new Date(body.occurred_at);
  if (!body.occurred_at || Number.isNaN(occurredAt.getTime())) {
    throw AppError.badRequest('occurred_at must be a valid date, e.g. 2026-10-25T03:12:00Z');
  }
  if (occurredAt.getTime() > Date.now() + FIVE_MIN_MS) {
    throw AppError.badRequest('occurred_at cannot be in the future');
  }

  let locationId: number | null = null;
  if (body.location_id != null) {
    locationId = Number(body.location_id);
    if (!Number.isInteger(locationId) || locationId < 1) {
      throw AppError.badRequest('location_id must be a positive whole number');
    }
  }

  const status: EventStatus = body.status ?? 'unverified';
  if (!STATUSES.includes(status)) {
    throw AppError.badRequest(`status must be one of: ${STATUSES.join(', ')}`);
  }

  return {
    event_type_id: eventTypeId,
    title,
    description,
    occurred_at: occurredAt,
    lat,
    lng,
    location_id: locationId,
    status,
  };
}