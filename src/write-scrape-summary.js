// src/write-scrape-summary.js
// Node 16+ recomendado
const fs = require('fs/promises');
const path = require('path');

async function safeReadJson(p) {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function main() {
  const feedPath = path.resolve(process.cwd(), 'feed.json');
  const diffPath = path.resolve(process.cwd(), 'diff.json');
  const outPath = path.resolve(process.cwd(), 'scrape_summary.txt');

  const feed = await safeReadJson(feedPath);
  const diff = await safeReadJson(diffPath);

  const total = Array.isArray(feed?.items) ? feed.items.length : 0;
  // diff may contain new_items OR newItems depending on code; try a few keys
  let newCount = 0;
  if (Array.isArray(diff?.new_items)) newCount = diff.new_items.length;
  else if (Array.isArray(diff?.newItems)) newCount = diff.newItems.length;
  else if (Array.isArray(diff?.items)) newCount = diff.items.length; // fallback
  else newCount = 0;

  const lines = [
    `TOTAL_ITEMS=${total}`,
    `NEW_ITEMS=${newCount}`,
    `GENERATED_AT=${new Date().toISOString()}`
  ];

  await fs.writeFile(outPath, lines.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${outPath} — TOTAL_ITEMS=${total} NEW_ITEMS=${newCount}`);
  // exit code 0
}

main().catch(err => {
  console.error('Error writing scrape_summary.txt:', err);
  process.exit(1);
});
