import { Router } from 'express';
import { getEvents, getEventTypes, createEvent } from '../controllers/events.controller';
import { requireAdmin } from '../utils/requireAdmin';

export const eventsRoutes = Router();

eventsRoutes.get('/', getEvents);                     // public
eventsRoutes.get('/types', getEventTypes);            // public (used by the admin form)
eventsRoutes.post('/', requireAdmin, createEvent);    // admin only