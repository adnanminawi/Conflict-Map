// Listens to the Telegram alerts channel and saves every new alert.
// Started from server.ts. Needs in .env:
//   TELEGRAM_API_ID, TELEGRAM_API_HASH  → from my.telegram.org
//   TELEGRAM_SESSION                    → from: npm run telegram:login
//   TELEGRAM_ALERTS_CHANNEL             → the channel's username, e.g. CumtaAlertsRussianChannel
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, type NewMessageEvent } from 'telegram/events';
import { LogLevel } from 'telegram/extensions/Logger';
import * as alertsService from '../services/alerts.service';

const CATCH_UP = 30; // after a (re)start, read the last 30 messages, in case some came while the server was off

export async function startTelegramAlerts() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const session = process.env.TELEGRAM_SESSION;
  const channel = process.env.TELEGRAM_ALERTS_CHANNEL;

  if (!apiId || !apiHash || !session || !channel) {
    console.log('Telegram alerts: off (TELEGRAM_* values missing in .env)');
    return;
  }

  const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 10, useWSS: true });
  client.setLogLevel(LogLevel.ERROR); // the library prints a lot by default
  await client.connect();

  // Messages are handled one at a time, in order: a long alert's second message
  // must be handled after its first one (it reuses its type and time).
  let queue = Promise.resolve();
  function handle(message: Api.Message) {
    queue = queue.then(async () => {
      if (!message.message) return; // e.g. only a photo, no text
      try {
        const saved = await alertsService.saveAlertMessage(message.id, message.message, new Date(message.date * 1000));
        if (saved > 0) console.log(`Telegram alerts: saved ${saved} alert(s) from message ${message.id}`);
      } catch (err) {
        console.error(`Telegram alerts: could not save message ${message.id}`, err);
      }
    });
  }

  // 1. Catch up on the last messages, oldest first. Already saved ones are skipped (external_id).
  const recent = await client.getMessages(channel, { limit: CATCH_UP });
  [...recent].reverse().forEach(handle);

  // 2. From now on: every new message, as soon as it is posted
  client.addEventHandler((event: NewMessageEvent) => handle(event.message), new NewMessage({ chats: [channel] }));
  console.log(`Telegram alerts: listening to @${channel}`);
}