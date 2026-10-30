// Saves a fake alert with the current time, to check the map. Not from Telegram.
// Usage:  npx tsx scripts/fakeAlert.ts
// Remove test alerts:  DELETE FROM alerts WHERE external_id LIKE 'tg:-%';
import 'dotenv/config';
import { db } from '../src/config/db';
import { saveAlertMessage } from '../src/services/alerts.service';

// Same format as the channel. No time line → it uses "now".
const text = `Цева адом в Нахаль Оз [00:00]:
• Округ Газа - Нахаль Оз, Кфар Аза, Саад`;

// A negative message id, so test alerts are easy to find and delete
saveAlertMessage(-Date.now(), text, new Date())
  .then((saved) => console.log(`Saved ${saved} test alert(s)`))
  .catch((err) => console.error('Failed:', err.message))
  .finally(() => db.end());