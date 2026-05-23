import fs from "fs/promises";
import { CONFIG } from "../config/constants.js";

export async function loadFeed() {
  try {
    const raw = await fs.readFile(CONFIG.FEED_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      generated_at: null,
      total: 0,
      items: []
    };
  }
}

export async function saveFeed(items) {
  const payload = {
    generated_at: new Date().toISOString(),
    total: items.length,
    items
  };

  await fs.writeFile(
    CONFIG.FEED_FILE,
    JSON.stringify(payload, null, 2)
  );

  return payload;
}

export async function saveNewItems(newItems) {
  const payload = {
    generated_at: new Date().toISOString(),
    count: newItems.length,
    new_items: newItems
  };

  await fs.writeFile(
    CONFIG.NEW_ITEMS_FILE,
    JSON.stringify(payload, null, 2)
  );

  await fs.writeFile(
    CONFIG.DIFF_FILE,
    JSON.stringify(payload, null, 2)
  );

  return payload;
}
