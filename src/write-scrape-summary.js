import fs from "fs/promises";
import { CONFIG } from "./config/constants.js";

async function main() {
  await fs.mkdir("./output", { recursive: true });
  try {
    const feed = JSON.parse(
      await fs.readFile(CONFIG.FEED_FILE, "utf8")
    );

    const newItems = JSON.parse(
      await fs.readFile(CONFIG.NEW_ITEMS_FILE, "utf8")
    );

    const summary = [
      `TOTAL_ITEMS=${feed.total}`,
      `NEW_ITEMS=${newItems.count}`,
      `GENERATED_AT=${feed.generated_at}`
    ].join("\n");

    await fs.writeFile("scrape_summary.txt", summary);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
