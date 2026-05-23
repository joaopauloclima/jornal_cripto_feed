import puppeteer from "puppeteer";

export async function createBrowser(headless = true) {
  return puppeteer.launch({
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
}
