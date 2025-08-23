// src/generate-feed.js (versão debug + mais robusta)
const fs = require('fs');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const TARGET_URL = 'https://br.tradingview.com/news-flow/?market=crypto';
const EXISTING_FEED_URL = process.env.EXISTING_FEED_URL || '';
const MAX_ITEMS = 60;
const WAIT_TIMEOUT = 45000;

function idFromLink(link) {
  return crypto.createHash('sha256').update(link).digest('hex');
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const dist = 800;
      const timer = setInterval(() => {
        window.scrollBy(0, dist);
        total += dist;
        if (total > 4000) {
          clearInterval(timer);
          resolve();
        }
      }, 400);
    });
  });
}

async function scrape() {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  // Opcional: definir user agent para reduzir chance de bloqueio
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36');

  await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: WAIT_TIMEOUT });
  // Dá um tempinho extra
  await page.waitForTimeout(2000);

  // rola para tentar carregar lazy-load
  await autoScroll(page);
  await page.waitForTimeout(1200);

  // tira screenshot e salva HTML para debug
  try {
    await page.screenshot({ path: 'page.png', fullPage: false });
    const html = await page.content();
    fs.writeFileSync('page.html', html, 'utf8');
    console.log('page.html and page.png saved for debugging.');
  } catch (e) {
    console.warn('Could not save screenshot/html:', e.message);
  }

  // Tente vários seletores alternativos
  const selectors = [
    '.tv-news-feed__item',
    '.tv-widget-news__item',
    '.tv-feed__item',
    '.js-news-feed__item',
    'article' // fallback
  ];

  // A função passada pro evaluate usa seletores que funcionem no DOM final
  const raw = await page.evaluate((selectors, MAX_ITEMS) => {
    function trySelect(selList) {
      for (const s of selList) {
        const nodes = Array.from(document.querySelectorAll(s || ''));
        if (nodes && nodes.length) return nodes;
      }
      return [];
    }
    const nodes = trySelect(selectors).slice(0, MAX_ITEMS);
    return nodes.map(node => {
      const a = node.querySelector('a') || node.querySelector('h3 a') || node.querySelector('h2 a');
      const title = a ? a.innerText.trim() : (node.innerText || '').trim().split('\n')[0];
      let link = a ? a.href : (node.querySelector('a') ? node.querySelector('a').href : null);
      if (link && link.startsWith('/')) link = window.location.origin + link;
      const sourceEl = node.querySelector('.tv-news-feed__source, .provider, .source');
      const source = sourceEl ? sourceEl.innerText.trim() : '';
      const timeEl = node.querySelector('time') || node.querySelector('.tv-widget-news__time, .time, .timestamp');
      const published = timeEl ? (timeEl.getAttribute('datetime') || timeEl.innerText) : null;
      const snippetEl = node.querySelector('.tv-widget-news__summary, .summary, p');
      const snippet = snippetEl ? snippetEl.innerText.trim() : '';
      const img = node.querySelector('img') ? node.querySelector('img').src : null;
      return { title, link, source, published, snippet, image: img };
    }).filter(i => i.title && i.link);
  }, selectors, MAX_ITEMS);

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

(async () => {
  try {
    console.log('Starting scrape...');
    const rawItems = await scrape();
    console.log('rawItems length:', rawItems.length);
    if (!rawItems || rawItems.length === 0) {
      console.warn('No items found — check page.html/page.png to debug selectors and dynamic loading.');
    } else {
      console.log('Sample item:', rawItems[0]);
    }

    const items = normalize(rawItems);
    const now = new Date().toISOString();
    const feed = { updated_at: now, source: 'TradingView News Flow - crypto', items };

    // write outputs
    fs.writeFileSync('feed.json', JSON.stringify(feed, null, 2), 'utf8');
    fs.writeFileSync('diff.json', JSON.stringify({ updated_at: now, new_items: items }, null, 2), 'utf8');

    console.log('Wrote feed.json and diff.json; items=', items.length);
    process.exit(0);
  } catch (err) {
    console.error('Error in scraper:', err);
    process.exit(2);
  }
})();
