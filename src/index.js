import "dotenv/config";

import fs from "fs/promises";
import { createBrowser } from "./scraper/browser.js";
import { scrapeTradingView } from "./scraper/tradingview.js";
import { normalizeNewsItem } from "./parser/normalize-news.js";
import { validateNewsItem } from "./schema/news-schema.js";
import { loadFeed, saveFeed, saveNewItems } from "./storage/feed-store.js";
import {
  loadSeenIds,
  saveSeenIds,
  getNewItems
} from "./storage/seen-ids.js";
import { sendToWebhook } from "./publishers/webhook.js";
import { logger } from "./utils/logger.js";
import { CONFIG } from "./config/constants.js";

async function ensureOutputDir() {
  await fs.mkdir(CONFIG.OUTPUT_DIR, { recursive: true });
}

async function main() {
  const startedAt = Date.now();

  await ensureOutputDir();

  const browser = await createBrowser(
    process.env.HEADLESS !== "false"
  );

  try {
    logger.info("Starting TradingView scrape");

    const rawItems = await scrapeTradingView(browser);

    const normalized = rawItems
      .map(normalizeNewsItem)
      .filter(validateNewsItem);

    const uniqueMap = new Map();

    for (const item of normalized) {
      uniqueMap.set(item.id, item);
    }

    const uniqueItems = [...uniqueMap.values()];

    await loadFeed();

    const seenIds = await loadSeenIds();

    const newItems = getNewItems(uniqueItems, seenIds);

    await saveFeed(uniqueItems);

    await saveNewItems(newItems);

    for (const item of uniqueItems) {
      seenIds.add(item.id);
    }

    await saveSeenIds(seenIds);

    for (const item of newItems) {
      try {
        await sendToWebhook(item);
      } catch (error) {
        logger.error(error);
      }
    }

    logger.info({
      scraped: uniqueItems.length,
      new_items: newItems.length,
      duration_ms: Date.now() - startedAt
    });

    process.exit(0);
  } catch (error) {
    logger.error(error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
