import crypto from "crypto";

export function normalizeNewsItem(item) {
  const normalizedUrl = item.href.split("?")[0].trim();

  const id = crypto
    .createHash("sha256")
    .update(`${item.title}|${normalizedUrl}`)
    .digest("hex");

  return {
    id,
    title: item.title.trim(),
    url: normalizedUrl,
    source: "tradingview",
    scraped_at: new Date().toISOString()
  };
}
