import { Router } from 'express';
import {getEvents, getEventTypes, getAdminEvents, createEvent, updateEvent, updateEventStatus, deleteEvent,} from '../controllers/events.controller';
import { requireAdmin } from '../utils/requireAdmin';

export const eventsRoutes = Router();

// Public
eventsRoutes.get('/', getEvents);
eventsRoutes.get('/types', getEventTypes);

// Admin only
eventsRoutes.get('/admin', requireAdmin, getAdminEvents);
eventsRoutes.post('/', requireAdmin, createEvent);
eventsRoutes.put('/:id', requireAdmin, updateEvent); // the map editor: moved / other type / new title…
eventsRoutes.patch('/:id/status', requireAdmin, updateEventStatus);
eventsRoutes.delete('/:id', requireAdmin, deleteEvent);