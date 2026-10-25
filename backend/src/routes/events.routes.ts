import { Router } from 'express';
import { getEvents, createEvent } from '../controllers/events.controller';

export const eventsRoutes = Router();

eventsRoutes.get('/', getEvents);  
eventsRoutes.post('/', createEvent);   