// Gives every saved news item its countries again, using the words in src/config/newsFeeds.ts (COUNTRY_WORDS).
// Run once after 006-news-countries.sql, and again whenever you change those words:
//   npm run tag:news
import 'dotenv/config';
import { db } from '../src/config/db';
import { retagAllNews } from '../src/services/news.service';

async function main() {
  const changed = await retagAllNews();
  console.log(`News: ${changed} item(s) got new countries`);
}

main()
  .catch((err) => {
    console.error('Could not tag the news:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());