import 'dotenv/config'; // must be the first import: loads .env before anything reads it
import { app } from './app';
import { db, checkDbConnection } from './config/db';
import { startTelegramAlerts } from './listeners/telegramAlerts';

async function start() {
  try {
    await checkDbConnection();
    console.log('Database connected');
  } catch (err) {
    console.error('Could not connect to the database:', err);
    process.exit(1);
  }

  const port = Number(process.env.PORT) || 4000;
  const server = app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });

  // Siren alerts from Telegram. If it fails, the rest of the API keeps working.
  startTelegramAlerts().catch((err) => console.error('Telegram alerts could not start:', err.message));

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await db.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection:', err);
});

start();
