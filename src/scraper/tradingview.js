import fs from "fs/promises";
import { CONFIG } from "../config/constants.js";
import { retry } from "../utils/retry.js";

const URL = "https://www.tradingview.com/news-flow/?market=crypto";

export async function scrapeTradingView(browser) {
  const page = await browser.newPage();

  try {
    await retry(async () => {
      await page.goto(URL, {
        waitUntil: "networkidle2",
        timeout: 60000
      });
    });

    await retry(async () => {
      await page.waitForSelector('[data-qa-id="news-headline-title"]', {
        timeout: 30000
      });
    });

    await page.evaluate(async () => {
      await new Promise(resolve => {
        let totalHeight = 0;
        const distance = 100;

        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= 3000) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    });

    const items = await page.$$eval("a[data-id]", anchors => {
      return anchors.map(anchor => ({
        data_id: anchor.getAttribute("data-id"),
        title: anchor.textContent?.trim() || "",
        href: anchor.href || ""
      }));
    });

    return items.filter(item => item.title && item.href);
  } catch (error) {
    await fs.writeFile(CONFIG.DEBUG_HTML, await page.content());

    await page.screenshot({
      path: CONFIG.DEBUG_SCREENSHOT,
      fullPage: true
    });

    throw error;
  } finally {
    await page.close();
  }
}
