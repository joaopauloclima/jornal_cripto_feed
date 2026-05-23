import fs from "fs/promises";
import { CONFIG } from "../config/constants.js";

const MAX_SEEN_IDS = 100;

export async function loadSeenIds() {
  try {
    const raw = await fs.readFile(CONFIG.SEEN_IDS_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return new Set(parsed.slice(-MAX_SEEN_IDS));
  } catch {
    return new Set();
  }
}

export async function saveSeenIds(ids) {
  const limitedIds = [...ids].slice(-MAX_SEEN_IDS);

  await fs.writeFile(
    CONFIG.SEEN_IDS_FILE,
    JSON.stringify(limitedIds, null, 2)
  );
}

export function getNewItems(items, seenIds) {
  return items.filter(item => !seenIds.has(item.id));
}
