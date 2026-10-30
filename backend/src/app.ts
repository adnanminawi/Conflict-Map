import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { routes } from './routes';
import { AppError } from './utils/AppError';
import multer from 'multer';

export const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use('/api/layers', express.json({ limit: '5mb' }));
app.use(express.json());

app.use('/api', routes);

// Error handler: must stay last. Returns JSON instead of an HTML stack trace.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too big (max 10 MB)' : err.message });
    return;
  }
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request body is not valid JSON' });
    return;
  }
  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Too much data in one request' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
app.use(errorHandler);
