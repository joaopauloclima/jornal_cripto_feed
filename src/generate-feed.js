// src/generate-feed.js
const fs = require('fs');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const TARGET_URL = 'https://br.tradingview.com/news-flow/?market=crypto';
const EXISTING_FEED_URL = process.env.EXISTING_FEED_URL || ''; // opcional
const MAX_ITEMS = 60;
const WAIT_TIMEOUT = 20000;

function idFromDataId(dataId) {
  // se já tiver data-id, retorne ele; senão hash do link
  if (!dataId) return null;
  return dataId;
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const distance = 800;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        total += distance;
        if (total > 3000) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

async function fetchExistingJson(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { timeout: 10000 });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('fetchExistingJson failed:', e.message);
    return null;
  }
}

async function scrape() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36');

  await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

  // garante que a região de notícias existe
  try {
    await page.waitForSelector('[data-qa-id="news-headline-title"]', { timeout: WAIT_TIMEOUT });
  } catch (e) {
    // se timeout, ainda tentamos scroll + captura (para debug)
    console.warn('waitForSelector timeout, tentando continuar...');
  }

  // rola para carregar itens virtuais (se houver virtual list)
  await autoScroll(page);
  await page.waitForTimeout(800);

  // salva HTML e screenshot para debug (actions artifact)
  try {
    const html = await page.content();
    fs.writeFileSync('page.html', html, 'utf8');
    await page.screenshot({ path: 'page.png', fullPage: false });
    console.log('Saved page.html and page.png for debugging.');
  } catch (e) {
    console.warn('Could not save debug artifacts:', e.message);
  }

  // extrai dados usando atributos estáveis (data-id, data-qa-id, relative-time)
  const raw = await page.evaluate(() => {
    const getText = el => el ? el.textContent.trim() : '';
    // selecionar os anchors que representam cards de notícia
    const anchors = Array.from(document.querySelectorAll('a[data-id]'));
    const items = anchors.map(a => {
      const dataId = a.getAttribute('data-id');
      const dataIndex = a.getAttribute('data-index');
      // title element (dentro do artigo)
      const titleEl = a.querySelector('[data-qa-id="news-headline-title"]');
      const title = titleEl ? (titleEl.getAttribute('data-overflow-tooltip-text') || getText(titleEl)) : getText(a);
      // relative-time (dentro do article or anchor)
      const rel = a.querySelector('relative-time') || a.querySelector('time');
      const published = rel ? (rel.getAttribute('event-time') || rel.getAttribute('datetime') || getText(rel)) : null;
      // provider
      const providerEl = a.querySelector('[class*="provider"] span') || a.querySelector('[class*="provider"]');
      const provider = providerEl ? getText(providerEl) : '';
      // image if any
      const img = a.querySelector('img');
      const image = img ? (img.src || img.getAttribute('data-src') || null) : null;
      // raw html (article or anchor)
      const article = a.querySelector('article') || a;
      const raw_html = article ? article.outerHTML : a.outerHTML;
      // link (href)
      const href = a.getAttribute('href') || a.href || null;

      return {
        data_id: dataId || null,
        index: dataIndex !== null ? Number(dataIndex) : null,
        title,
        link: href,
        source: provider,
        published_raw: published,
        image,
        raw_html
      };
    });

    // filter valid items
    return items.filter(i => i.title && i.link).slice(0, 200);
  });

  await browser.close();
  return raw.slice(0, MAX_ITEMS);
}

function normalize(rawItems, pageUrl = TARGET_URL) {
  return rawItems.map(it => {
    let link = it.link || '';
    try {
      // normaliza links relativos
      if (link && link.startsWith('/')) link = new URL(link, pageUrl).href;
    } catch(e) { /* ignore */ }

    // parse published
    let published_at;
    if (it.published_raw) {
      const d = new Date(it.published_raw);
      published_at = isNaN(d) ? new Date().toISOString() : d.toISOString();
    } else {
      published_at = new Date().toISOString();
    }

    return {
      id: it.data_id || link || crypto.createHash('sha256').update((it.title||'') + (link||'')).digest('hex'),
      index: it.index,
      title: it.title,
      link,
      source: it.source || 'TradingView',
      published_at,
      snippet: '',           // snippet não disponível no HTML (pode ser extraído se houver)
      image: it.image || null,
      raw_html: it.raw_html || null
    };
  });
}

(async () => {
  try {
    console.log('Starting scrape...');
    const raw = await scrape();
    console.log('raw items found:', raw.length);
    if (!raw || raw.length === 0) {
      console.warn('Nenhum item encontrado. Verifique page.html/page.png gerados.');
    } else {
      console.log('Exemplo item:', raw[0]);
    }

    const items = normalize(raw);
    const now = new Date().toISOString();
    const feed = { updated_at: now, source: 'TradingView News Flow - crypto', items };

    // opcional: se EXISTING_FEED_URL estiver definido, baixar e gerar diff somente com novos ids
    let diffItems = items;
    if (EXISTING_FEED_URL) {
      try {
        const res = await fetch(EXISTING_FEED_URL);
        if (res.ok) {
          const existing = await res.json();
          const known = new Set((existing.items || []).map(x => x.id));
          diffItems = items.filter(i => !known.has(i.id));
        }
      } catch (e) {
        console.warn('Could not fetch existing feed for diff:', e.message);
      }
    }

    fs.writeFileSync('feed.json', JSON.stringify(feed, null, 2), 'utf8');
    fs.writeFileSync('diff.json', JSON.stringify({ updated_at: now, new_items: diffItems }, null, 2), 'utf8');

    console.log('Wrote feed.json and diff.json; total items:', items.length, 'new_items:', diffItems.length);
    process.exit(0);
  } catch (err) {
    console.error('Error in scraper:', err);
    process.exit(2);
  }
})();
