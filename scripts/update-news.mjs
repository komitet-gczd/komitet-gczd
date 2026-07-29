import Parser from "rss-parser";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Komitet-Bezpiecznej-Onkologii-Dzieciecej/1.0"
  }
});

const outputPath = new URL(
  "../src/data/auto-publications.json",
  import.meta.url
);

/*
 * Na początek korzystamy z oficjalnych kanałów RMF24.
 * Kolejne kanały będziemy dopisywać w tym miejscu.
 */
const feeds = [
  {
    name: "RMF24 – Śląskie",
    url: "https://www.rmf24.pl/regiony/slaskie/feed",
    platform: "Portal"
  },
  {
    name: "RMF24 – Zdrowie",
    url: "https://www.rmf24.pl/fakty/feed",
    platform: "Portal"
  }
];

/*
 * Artykuł musi zawierać:
 * 1. przynajmniej jedno hasło główne,
 * 2. przynajmniej jedno hasło dotyczące leczenia.
 *
 * Dzięki temu nie dodamy każdej przypadkowej wiadomości z Katowic
 * albo Zabrza.
 */
const subjectKeywords = [
  "GCZD",
  "Górnośląskie Centrum Zdrowia Dziecka",
  "onkologia dziecięca",
  "hematologia dziecięca",
  "Śląskie Centrum Onkologii i Hematologii Dziecięcej",
  "Mizia-Malarz",
  "Mizia Malarz",
  "bezpieczna onkologia dziecięca"
];

const contextKeywords = [
  "onkolog",
  "nowotwor",
  "guz",
  "chemioterap",
  "dzieci",
  "pacjent",
  "leczeni",
  "oddział",
  "szpital",
  "Katowic",
  "Zabrz"
];

function normalizeText(value = "") {
  return value
    .toLocaleLowerCase("pl-PL")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(text, keywords) {
  return keywords.some((keyword) =>
    text.includes(normalizeText(keyword))
  );
}

function isRelevant(item) {
  const text = normalizeText(
    [
      item.title,
      item.contentSnippet,
      item.content,
      item.categories?.join(" ")
    ]
      .filter(Boolean)
      .join(" ")
  );

  return (
    containsAny(text, subjectKeywords) &&
    containsAny(text, contextKeywords)
  );
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);

    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid"
    ].forEach((parameter) => {
      url.searchParams.delete(parameter);
    });

    url.hash = "";

    return url.toString();
  } catch {
    return value;
  }
}

function createId(url) {
  return `auto-${createHash("sha256")
    .update(url)
    .digest("hex")
    .slice(0, 16)}`;
}

function formatPolishDate(dateISO) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Warsaw"
  }).format(new Date(dateISO));
}

function cleanDescription(value = "") {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
}

async function loadExistingPublications() {
  try {
    const contents = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(contents);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function fetchFeed(feed) {
  try {
    const result = await parser.parseURL(feed.url);

    return result.items
      .filter((item) => item.link && item.title)
      .filter(isRelevant)
      .map((item) => {
        const href = normalizeUrl(item.link);

        const rawDate =
          item.isoDate ||
          item.pubDate ||
          new Date().toISOString();

        const dateISO = new Date(rawDate)
          .toISOString()
          .slice(0, 10);

        return {
          id: createId(href),
          category: "media",
          featured: false,
          automatic: true,
          date: formatPolishDate(dateISO),
          dateISO,
          source: item.creator || feed.name.split(" – ")[0],
          platform: feed.platform,
          type: "Artykuł",
          title: item.title.trim(),
          description:
            cleanDescription(
              item.contentSnippet || item.content || ""
            ) || "Publikacja dotycząca onkologii dziecięcej na Śląsku.",
          href
        };
      });
  } catch (error) {
    console.error(
      `Nie udało się pobrać kanału ${feed.name}:`,
      error.message
    );

    return [];
  }
}

const existing = await loadExistingPublications();
const downloaded = [];

for (const feed of feeds) {
  const entries = await fetchFeed(feed);
  downloaded.push(...entries);
}

const publicationsByUrl = new Map();

for (const publication of [...existing, ...downloaded]) {
  publicationsByUrl.set(
    normalizeUrl(publication.href),
    publication
  );
}

const publications = [...publicationsByUrl.values()].sort(
  (a, b) => new Date(b.dateISO) - new Date(a.dateISO)
);

await writeFile(
  outputPath,
  `${JSON.stringify(publications, null, 2)}\n`,
  "utf8"
);

const addedCount = publications.length - existing.length;

console.log(`Znaleziono: ${downloaded.length}`);
console.log(`Dodano nowych: ${Math.max(addedCount, 0)}`);
console.log(`Łącznie automatycznych: ${publications.length}`);