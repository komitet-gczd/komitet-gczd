import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const OUTPUT_PATH = new URL("../src/data/auto-publications.json", import.meta.url);
const MONITORING_START = new Date("2026-06-01T00:00:00+02:00");
const MAX_RESULTS_PER_QUERY = 20;
const MAX_FINAL_RESULTS = 60;
const MIN_RELEVANCE_SCORE = 3;

const SEARCH_QUERIES = [
  '"GCZD" onkologia Zabrze',
  '"Górnośląskie Centrum Zdrowia Dziecka" onkologia Zabrze',
  '"onkologia dziecięca" Katowice Zabrze',
  '"przeniesienie onkologii" Katowice Zabrze dzieci',
  '"guzy mózgu" GCZD',
  '"guzy lite" GCZD',
  '"Śląskie Centrum Onkologii i Hematologii Dziecięcej" Katowice',
  '"Bezpieczna Onkologia Dziecięca"',
  '"Komitet na rzecz Bezpiecznej Onkologii Dziecięcej"',
  '"petycja" GCZD onkologia'
];

const INSTITUTION_TERMS = [
  "gczd",
  "górnośląskie centrum zdrowia dziecka",
  "śląskie centrum onkologii i hematologii dziecięcej"
];

const ONCOLOGY_TERMS = [
  "onkologia", "onkologii", "onkologiczny", "onkologiczne",
  "hematologia", "hematologii", "guzy mózgu", "guz mózgu",
  "guzy lite", "guz lity", "nowotwór", "nowotwory"
];

const CASE_TERMS = [
  "zabrze",
  "katowice",
  "przeniesienie",
  "przeniesiono",
  "przeniesiona",
  "przywrócenie",
  "przywrócenia",
  "zamknięcie oddziału",
  "zamknięty oddział",
  "połączenie oddziałów",
  "oddział",
  "brak lekarzy",
  "lekarze",
  "odeszli",
  "rezygnują",
  "rezygnacja",
  "wypowiedzenia",
  "rodzice",
  "apel",
  "petycja",
  "prokuratura",
  "śledczy",
  "komitet",
  "bezpieczna onkologia dziecięca",
  "1 lipca",
  "lipca 2026"
];

const EXCLUDE_TERMS = [
  "porodówka", "poród", "położnictwo", "świetlica", "znieczulenie do biopsji",
  "szkoła rodzenia", "królewskie warunki dla mamy", "neurologii dziecięcej",
  "chorzowie wznowi przyjęcia", "chorzów", "chorzowie"
];

const GOOGLE_IMAGE_MARKERS = [
  "google-news", "google_news", "gnews", "news.google.com",
  "gstatic.com", "googleusercontent.com/favicon"
];

function normalizeText(value = "") {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchable(value = "") {
  return normalizeText(value).toLocaleLowerCase("pl-PL");
}

function containsAny(text, terms) {
  return terms.some((term) => text.includes(searchable(term)));
}

function relevanceScore(item) {
  const title = searchable(item.title);
  const description = searchable(item.description);
  const source = searchable(item.source);
  const text = `${title} ${description} ${source}`;

  if (containsAny(text, EXCLUDE_TERMS)) return -100;

  let score = 0;
  if (containsAny(title, INSTITUTION_TERMS)) score += 4;
  else if (containsAny(text, INSTITUTION_TERMS)) score += 2;

  if (containsAny(title, ONCOLOGY_TERMS)) score += 4;
  else if (containsAny(text, ONCOLOGY_TERMS)) score += 2;

  if (containsAny(title, CASE_TERMS)) score += 3;
  else if (containsAny(text, CASE_TERMS)) score += 1;

  if (title.includes("bezpieczna onkologia dziecięca")) score += 8;
  if (title.includes("komitet") && title.includes("onkolog")) score += 5;
  if (title.includes("petycja") && title.includes("gczd")) score += 5;
  if (title.includes("zabrze") && title.includes("katowice")) score += 3;

  return score;
}

function isRelevant(item) {
  const score = relevanceScore(item);

  const text = searchable(
    `${item.title || ""} ${item.description || ""} ${item.source || ""}`
  );

  if (containsAny(text, EXCLUDE_TERMS)) {
    return false;
  }

  const hasInstitution = containsAny(text, INSTITUTION_TERMS);
  const hasOncology = containsAny(text, ONCOLOGY_TERMS);
  const hasCaseContext = containsAny(text, CASE_TERMS);

  const directCommitteeMatch =
    text.includes("bezpieczna onkologia dziecięca") ||
    (text.includes("komitet") && text.includes("onkolog"));

  const directPetitionMatch =
    text.includes("petycja") &&
    (
      text.includes("gczd") ||
      text.includes("guzami mózgu") ||
      text.includes("onkologii dziecięcej")
    );

  return (
    directCommitteeMatch ||
    directPetitionMatch ||
    (
      score >= MIN_RELEVANCE_SCORE &&
      hasOncology &&
      (hasInstitution || hasCaseContext)
    )
  );
}

function safeDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRecentEnough(value) {
  const date = safeDate(value);
  return date ? date >= MONITORING_START : true;
}

function formatDate(value) {
  const date = safeDate(value) || new Date();
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw"
  }).format(date);
}

function dateISO(value) {
  const date = safeDate(value) || new Date();
  return date.toISOString().slice(0, 10);
}

function normalizeUrl(value = "") {
  try {
    const url = new URL(value);
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]
      .forEach((key) => url.searchParams.delete(key));
    url.hash = "";
    return url.toString();
  } catch {
    return String(value).trim();
  }
}

function makeId(value) {
  return `auto-${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function cleanDescription(value = "") {
  const text = normalizeText(value);
  if (!text) return "Publikacja dotycząca bezpieczeństwa dziecięcej onkologii na Śląsku.";
  return text.length > 340 ? `${text.slice(0, 337).trimEnd()}...` : text;
}

function imageIsUsable(value) {
  if (!value || !/^https?:\/\//i.test(value)) return false;
  const lower = value.toLowerCase();
  return !GOOGLE_IMAGE_MARKERS.some((marker) => lower.includes(marker));
}

function absoluteGoogleUrl(value) {
  if (!value) return null;
  try { return new URL(value, "https://news.google.com").toString(); }
  catch { return null; }
}

async function acceptConsent(page) {
  const candidates = [
    'button:has-text("Zaakceptuj wszystko")',
    'button:has-text("Akceptuję")',
    'button:has-text("Accept all")',
    'button:has-text("I agree")'
  ];

  for (const selector of candidates) {
    const button = page.locator(selector).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {});
      await page.waitForTimeout(800);
      return;
    }
  }
}

function buildSearchUrl(query) {
  const params = new URLSearchParams({ q: query, hl: "pl", gl: "PL", ceid: "PL:pl" });
  return `https://news.google.com/search?${params.toString()}`;
}

async function collectSearchResults(page, query) {
  const searchUrl = buildSearchUrl(query);

  await page.goto(searchUrl, {
    waitUntil: "domcontentloaded",
    timeout: 45_000
  });

  await acceptConsent(page);
  await page.waitForTimeout(3000);

  console.log(`\nZapytanie: ${query}`);
  console.log(`Adres strony: ${page.url()}`);
  console.log(`Tytuł strony: ${await page.title()}`);

  // Google News zmienia znaczniki kart, dlatego szukamy bezpośrednio
  // linków prowadzących do artykułów.
  const articleLinks = page.locator(
    [
      'a[href^="./articles/"]',
      'a[href^="./read/"]',
      'a[href*="/articles/"]',
      'a[href*="/read/"]'
    ].join(", ")
  );

  const linksCount = await articleLinks.count();

  console.log(`Znalezionych linków do artykułów: ${linksCount}`);

  // Pliki diagnostyczne – przydadzą się, jeżeli Google pokaże blokadę.
  if (linksCount === 0) {
    await page.screenshot({
      path: "google-news-debug.png",
      fullPage: true
    });

    const html = await page.content();
    await writeFile("google-news-debug.html", html, "utf8");

    console.log("Nie znaleziono wyników.");
    console.log("Zapisano:");
    console.log("- google-news-debug.png");
    console.log("- google-news-debug.html");

    return [];
  }

  const results = await articleLinks.evaluateAll(
    (links, maxResults) => {
      const unique = new Map();

      for (const link of links) {
        const title = (link.textContent || "")
          .replace(/\s+/g, " ")
          .trim();

        if (!title || title.length < 15) {
          continue;
        }

        const href = link.getAttribute("href") || "";

        if (!href) {
          continue;
        }

        /*
         * Karta może być elementem article, c-wiz albo większym divem.
         * closest() pozwala obsłużyć różne wersje układu Google News.
         */
        const card =
          link.closest("article") ||
          link.closest("c-wiz") ||
          link.parentElement?.parentElement ||
          link.parentElement;

        const time = card?.querySelector("time");
        const image = card?.querySelector("img");

        const sourceCandidates = card
          ? [...card.querySelectorAll("div, span, a")]
              .map((node) =>
                (node.textContent || "").replace(/\s+/g, " ").trim()
              )
              .filter(
                (text) =>
                  text &&
                  text !== title &&
                  text.length >= 2 &&
                  text.length <= 80
              )
          : [];

        const source = sourceCandidates[0] || "Media";

        const item = {
          title,
          googleUrl: href,
          source,
          publishedAt:
            time?.getAttribute("datetime") ||
            time?.textContent?.trim() ||
            "",
          image:
            image?.getAttribute("src") ||
            image?.getAttribute("data-src") ||
            "",
          articleText: (card?.textContent || title)
            .replace(/\s+/g, " ")
            .trim()
        };

        if (!unique.has(href)) {
          unique.set(href, item);
        }

        if (unique.size >= maxResults) {
          break;
        }
      }

      return [...unique.values()];
    },
    MAX_RESULTS_PER_QUERY
  );

  console.log(`Pobrano kart: ${results.length}`);

  return results.map((item) => ({
    ...item,
    googleUrl: absoluteGoogleUrl(item.googleUrl),
    description: item.articleText
  }));
}

async function resolvePublisherUrl(context, googleUrl) {
  const page = await context.newPage();
  try {
    await page.goto(googleUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(800);
    const finalUrl = normalizeUrl(page.url());
    if (!finalUrl.includes("news.google.com")) return finalUrl;

    const externalLink = await page.locator(
      'a[href^="http"]:not([href*="google.com"]):not([href*="gstatic.com"])'
    ).first().getAttribute("href").catch(() => null);

    return externalLink ? normalizeUrl(externalLink) : finalUrl;
  } catch {
    return normalizeUrl(googleUrl);
  } finally {
    await page.close();
  }
}

async function fetchMetadata(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const metadata = await page.evaluate(() => {
      const meta = (selector) => document.querySelector(selector)?.getAttribute("content") || null;
      const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href") || null;
      return {
        canonical,
        title: meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]') || document.title || null,
        description: meta('meta[property="og:description"]') || meta('meta[name="twitter:description"]') || meta('meta[name="description"]') || null,
        image: meta('meta[property="og:image:secure_url"]') || meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]') || null,
        publishedAt: meta('meta[property="article:published_time"]') || meta('meta[name="date"]') || document.querySelector("time[datetime]")?.getAttribute("datetime") || null
      };
    });
    return { ...metadata, finalUrl: normalizeUrl(metadata.canonical || page.url()) };
  } catch {
    return { canonical: null, title: null, description: null, image: null, publishedAt: null, finalUrl: normalizeUrl(url) };
  } finally {
    await page.close();
  }
}

async function loadExisting() {
  try {
    const raw = await readFile(OUTPUT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn("Nie udało się odczytać istniejącego JSON:", error.message);
    return [];
  }
}

function uniqueRawResults(items) {
  const map = new Map();
  for (const item of items) {
    const key = searchable(item.title);
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

function merge(existing, downloaded) {
  const map = new Map();
  for (const item of [...existing, ...downloaded]) {
    if (!item?.href || !item?.title) continue;
    const key = normalizeUrl(item.href);
    const current = map.get(key);
    map.set(key, current ? {
      ...current, ...item,
      image: item.image || current.image || null,
      description: item.description || current.description
    } : { ...item, href: key });
  }

  return [...map.values()]
    .filter((item) => isRecentEnough(item.dateISO))
    .sort((a, b) => (safeDate(b.dateISO)?.getTime() || 0) - (safeDate(a.dateISO)?.getTime() || 0))
    .slice(0, MAX_FINAL_RESULTS);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
    viewport: { width: 1440, height: 1000 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36"
  });

  try {
    const searchPage = await context.newPage();
    const raw = [];

    for (const query of SEARCH_QUERIES) {
      raw.push(...await collectSearchResults(searchPage, query));
      await searchPage.waitForTimeout(900);
    }

    await searchPage.close();
    const unique = uniqueRawResults(raw);
    console.log(`\nUnikalnych kandydatów: ${unique.length}`);

    const relevantCandidates = unique.filter((item) => {
      const score = relevanceScore(item);
      const accepted = isRelevant(item);
      console.log(`${accepted ? "✓" : "×"} [${score}] ${item.title}`);
      return accepted;
    });

    console.log(`\nPo filtrze merytorycznym: ${relevantCandidates.length}`);
    const downloaded = [];

    for (const [index, candidate] of relevantCandidates.entries()) {
      const publisherUrl = await resolvePublisherUrl(context, candidate.googleUrl);
      const metadata = await fetchMetadata(context, publisherUrl);
      const publishedAt = metadata.publishedAt || candidate.publishedAt || new Date().toISOString();

      if (!isRecentEnough(publishedAt)) {
        console.log(`Pominięto stary materiał: ${candidate.title}`);
        continue;
      }

      const finalItem = {
        id: makeId(metadata.finalUrl || publisherUrl),
        category: "media",
        featured: false,
        automatic: true,
        date: formatDate(publishedAt),
        dateISO: dateISO(publishedAt),
        source: normalizeText(candidate.source) || "Media",
        platform: "Portal",
        type: "Artykuł",
        title: normalizeText(candidate.title),
        description: cleanDescription(metadata.description || candidate.description),
        href: metadata.finalUrl || publisherUrl,
        image: imageIsUsable(metadata.image) ? metadata.image :
          imageIsUsable(candidate.image) ? candidate.image : null,
        relevanceScore: relevanceScore(candidate)
      };

      downloaded.push(finalItem);
      console.log(`[${index + 1}/${relevantCandidates.length}] ${finalItem.image ? "🖼️" : "—"} ${finalItem.title}`);
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    const existing = await loadExisting();
    const merged = merge(existing, downloaded);
    await writeFile(OUTPUT_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

    const existingUrls = new Set(existing.map((item) => normalizeUrl(item.href || "")));
    const added = merged.filter((item) => !existingUrls.has(normalizeUrl(item.href))).length;

    console.log("\nPodsumowanie");
    console.log(`Kandydatów: ${unique.length}`);
    console.log(`Zaakceptowanych: ${downloaded.length}`);
    console.log(`Dodano nowych: ${added}`);
    console.log(`Z miniaturką: ${downloaded.filter((item) => item.image).length}`);
    console.log(`Łącznie automatycznych: ${merged.length}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("\nKrytyczny błąd:");
  console.error(error);
  process.exitCode = 1;
});
