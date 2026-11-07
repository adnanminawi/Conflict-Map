// Reads the RSS feeds every few minutes and saves the news about the conflict.
// Started from server.ts. The feeds and keywords are in config/newsFeeds.ts.
import Parser from 'rss-parser';
import { NEWS_FEEDS } from '../config/newsFeeds';
import * as newsService from '../services/news.service';

const EVERY_MINUTES = 10;

const parser = new Parser({ timeout: 15_000 }); // a slow feed gives up after 15 s instead of hanging

let running = false; // stops a new round starting while the last one is still going

async function readAllFeeds() {
  if (running) return;
  running = true;
  try {
    // One feed at a time. If one fails (down, URL changed), the others still run.
    for (const feed of NEWS_FEEDS) {
      try {
        const result = await parser.parseURL(feed.url);
        const saved = await newsService.saveFeedItems(feed, result.items);
        if (saved > 0) console.log(`News: saved ${saved} new item(s) from ${feed.sourceName}`);
      } catch (err: any) {
        console.error(`News: could not read ${feed.sourceName} (${feed.url}):`, err.message);
      }
    }
  } finally {
    running = false;
  }
}

export function startNewsFeeds() {
  console.log(`News: reading ${NEWS_FEEDS.length} feed(s) every ${EVERY_MINUTES} min`);
  readAllFeeds(); // once now, so you don't wait 10 minutes after a restart
  setInterval(readAllFeeds, EVERY_MINUTES * 60 * 1000);
}