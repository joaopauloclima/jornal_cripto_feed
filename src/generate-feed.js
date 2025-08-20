// src/generate-feed.js
const fs = require('fs');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

// use global fetch (Node 18+)
await fetch('https://br.tradingview.com/news-flow/?market=crypto'); // funciona no Node 20

const TARGET_URL = 'https://br.tradingview.com/news-flow/?market=crypto';
const EXISTING_FEED_URL = process.env.EXISTING_FEED_URL || ''; // optional: URL publica do feed.json atual
const MAX_ITEMS = 40;

function idFromLink(link) {
  return crypto.createHash('sha256').update(link).digest('hex');
}

async function scrape() {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForTimeout(1500);

  // *** ATENÇÃO: seletores podem precisar ajuste se o DOM mudar ***
  const raw = await page.evaluate(() => {
    const list = Array.from(document.querySelectorAll('.tv-news-feed__item, .tv-widget-news__item, .tv-feed__item'));
    return list.slice(0, 60).map(node => {
      const a = node.querySelector('a') || node.querySelector('.tv-widget-news__headline a');
      const title = a ? a.innerText.trim() : (node.innerText || '').trim().split('\n')[0];
      let link = a ? a.href : null;
      if (link && link.startsWith('/')) link = window.location.origin + link;
      const sourceEl = node.querySelector('.tv-news-feed__source, .tv-widget-news__source, .provider');
      const source = sourceEl ? sourceEl.innerText.trim() : '';
      const timeEl = node.querySelector('time') || node.querySelector('.tv-widget-news__time, .tv-news-feed__time');
      const published = timeEl ? (timeEl.getAttribute('datetime') || timeEl.innerText) : null;
      const snippetEl = node.querySelector('.tv-widget-news__summary, .summary') || node.querySelector('.tv-news-feed__subtitle');
      const snippet = snippetEl ? snippetEl.innerText.trim() : '';
      const img = node.querySelector('img') ? node.querySelector('img').src : null;
      return { title, link, source, published, snippet, image: img };
    }).filter(i => i.title && i.link);
  });

  await browser.close();
  return raw.slice(0, MAX_ITEMS);
}

function normalize(items) {
  return items.map(it => {
    const parsed = it.published ? new Date(it.published) : new Date();
    const published_at = isNaN(parsed) ? new Date().toISOString() : parsed.toISOString();
    return {
      id: idFromLink(it.link),
      title: it.title,
      link: it.link,
      source: it.source || 'TradingView',
      published_at,
      snippet: it.snippet || '',
      image: it.image || null
    };
  });
}

async function fetchExisting() {
  if (!EXISTING_FEED_URL) return null;
  try {
    const res = await fetch(EXISTING_FEED_URL, { timeout: 10000 });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('fetchExisting failed:', e.message);
    return null;
  }
}

(async () => {
  try {
    console.log('Starting scrape...');
    const rawItems = await scrape();
    const items = normalize(rawItems);
    const now = new Date().toISOString();
    const feed = { updated_at: now, source: 'TradingView News Flow - crypto', items };

    // get existing published feed (to compute diff)
    const existing = await fetchExisting();
    let newItems = items;
    if (existing && Array.isArray(existing.items)) {
      const known = new Set(existing.items.map(x => x.id));
      newItems = items.filter(i => !known.has(i.id));
    }

    // write outputs
    fs.writeFileSync('feed.json', JSON.stringify(feed, null, 2), 'utf8');
    fs.writeFileSync('diff.json', JSON.stringify({ updated_at: now, new_items: newItems }, null, 2), 'utf8');

    console.log('TOTAL_ITEMS=' + items.length);
    console.log('NEW_ITEMS=' + newItems.length);
    // write summary for Actions to read easily
    fs.writeFileSync('scrape_summary.txt', `TOTAL_ITEMS=${items.length}\nNEW_ITEMS=${newItems.length}\n`, 'utf8');

    process.exit(0);
  } catch (err) {
    console.error('Error in scraper:', err);
    process.exit(2);
  }
})();
