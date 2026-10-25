import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { routes } from './routes';
import { AppError } from './utils/AppError';

export const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json());

app.use('/api', routes);

// Error handler: must stay last. Returns JSON instead of an HTML stack trace.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
app.use(errorHandler);
