/** Wikimedia image lookup and attribution helpers for City Reveal landmarks. */

const WIKI_THUMB_LANGS = ['en', 'es'] as const;
const WIKI_THUMB_SIZE = 500;

export interface WikiImageAttribution {
  sourceUrl: string;
  author?: string;
  licence?: string;
  licenceUrl?: string;
}

export interface WikiImage {
  imageUrl: string;
  attribution: WikiImageAttribution;
}

interface WikipediaSummaryResponse {
  thumbnail?: { source: string };
  content_urls?: { desktop?: { page?: string } };
}

interface PageImageQueryResponse {
  query?: {
    pages?: Record<string, PageImagePage>;
  };
}

interface PageImagePage {
  pageimage?: string;
  thumbnail?: { source: string };
  canonicalurl?: string;
  fullurl?: string;
}

interface ImageInfoQueryResponse {
  query?: {
    pages?: Record<string, ImageInfoPage>;
  };
}

interface ImageInfoPage {
  imageinfo?: ImageInfo[];
}

interface ImageInfo {
  descriptionurl?: string;
  extmetadata?: {
    Artist?: { value?: string };
    LicenseShortName?: { value?: string };
    LicenseUrl?: { value?: string };
    Credit?: { value?: string };
  };
}

interface SummaryThumb {
  imageUrl: string;
  articleUrl: string;
  lang: string;
}

function firstPage<T extends { query?: { pages?: Record<string, unknown> } }>(data: T): unknown {
  const pages = data.query?.pages;
  if (!pages) {
    return null;
  }
  return Object.values(pages)[0] ?? null;
}

function stripHtml(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const doc = new DOMParser().parseFromString(value, 'text/html');
  const text = doc.body.textContent?.replace(/\s+/g, ' ').trim();
  return text || undefined;
}

function fileTitleFromCommonsThumbUrl(url: string): string | null {
  const match = url.match(/\/wikipedia\/commons\/thumb\/[^/]+\/[^/]+\/([^/]+)\//);
  if (!match) {
    return null;
  }
  return `File:${decodeURIComponent(match[1]).replace(/_/g, ' ')}`;
}

function filePageUrl(apiBaseUrl: string, fileTitle: string): string {
  return `${apiBaseUrl}/wiki/${encodeURIComponent(fileTitle.replace(/ /g, '_')).replace('%3A', ':')}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.json() as T;
}

async function fetchSummaryThumb(title: string): Promise<SummaryThumb | null> {
  let lastProblem: string | unknown = 'no thumbnail on page';
  for (const lang of WIKI_THUMB_LANGS) {
    try {
      const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const data = await fetchJson<WikipediaSummaryResponse>(url);
      if (data.thumbnail?.source) {
        return {
          imageUrl: data.thumbnail.source,
          articleUrl: data.content_urls?.desktop?.page ?? data.thumbnail.source,
          lang,
        };
      }
      lastProblem = `no thumbnail (${lang})`;
    } catch (err) {
      lastProblem = err;
    }
  }
  console.warn(`[cityRevealImages] Wikipedia thumbnail not available for "${title}":`, lastProblem);
  return null;
}

async function fetchPageImage(title: string, lang: string): Promise<PageImagePage | null> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    prop: 'pageimages|info',
    piprop: 'thumbnail|name',
    pithumbsize: String(WIKI_THUMB_SIZE),
    inprop: 'url',
    titles: title,
  });
  const data = await fetchJson<PageImageQueryResponse>(`https://${lang}.wikipedia.org/w/api.php?${params}`);
  return firstPage(data) as PageImagePage | null;
}

async function fetchImageAttribution(
  apiBaseUrl: string,
  fileTitle: string,
  fallbackSourceUrl: string,
): Promise<WikiImageAttribution> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    titles: fileTitle,
  });
  const data = await fetchJson<ImageInfoQueryResponse>(`${apiBaseUrl}/w/api.php?${params}`);
  const page = firstPage(data) as ImageInfoPage | null;
  const imageInfo = page?.imageinfo?.[0];
  return {
    sourceUrl: imageInfo?.descriptionurl ?? fallbackSourceUrl,
    author: stripHtml(imageInfo?.extmetadata?.Artist?.value ?? imageInfo?.extmetadata?.Credit?.value),
    licence: stripHtml(imageInfo?.extmetadata?.LicenseShortName?.value),
    licenceUrl: imageInfo?.extmetadata?.LicenseUrl?.value,
  };
}

function fallbackAttribution(sourceUrl: string): WikiImageAttribution {
  return { sourceUrl };
}

export async function fetchWikiThumb(title: string): Promise<string | null> {
  return (await fetchSummaryThumb(title))?.imageUrl ?? null;
}

export async function fetchWikiImage(title: string): Promise<WikiImage | null> {
  const summaryThumb = await fetchSummaryThumb(title);
  if (!summaryThumb) {
    return null;
  }

  try {
    const page = await fetchPageImage(title, summaryThumb.lang);
    const imageTitle = page?.pageimage ? `File:${page.pageimage}` : null;
    const imageUrl = page?.thumbnail?.source ?? summaryThumb.imageUrl;
    if (!imageTitle) {
      return { imageUrl, attribution: fallbackAttribution(summaryThumb.articleUrl) };
    }
    const apiBaseUrl = `https://${summaryThumb.lang}.wikipedia.org`;
    const sourceUrl = filePageUrl(apiBaseUrl, imageTitle);
    try {
      const attribution = await fetchImageAttribution(apiBaseUrl, imageTitle, sourceUrl);
      return { imageUrl, attribution };
    } catch (err) {
      console.warn(`[cityRevealImages] Attribution metadata not available for "${imageTitle}":`, err);
      return { imageUrl, attribution: fallbackAttribution(sourceUrl) };
    }
  } catch (err) {
    console.warn(`[cityRevealImages] Image metadata not available for "${title}":`, err);
    return { imageUrl: summaryThumb.imageUrl, attribution: fallbackAttribution(summaryThumb.articleUrl) };
  }
}

export async function fetchFixedCommonsImage(thumbnailUrl: string): Promise<WikiImage> {
  const fileTitle = fileTitleFromCommonsThumbUrl(thumbnailUrl);
  if (!fileTitle) {
    console.warn(`[cityRevealImages] Could not derive Commons file title from fixed thumbnail "${thumbnailUrl}"`);
    return { imageUrl: thumbnailUrl, attribution: fallbackAttribution(thumbnailUrl) };
  }

  const sourceUrl = filePageUrl('https://commons.wikimedia.org', fileTitle);
  try {
    const attribution = await fetchImageAttribution('https://commons.wikimedia.org', fileTitle, sourceUrl);
    return { imageUrl: thumbnailUrl, attribution };
  } catch (err) {
    console.warn(`[cityRevealImages] Attribution metadata not available for "${fileTitle}":`, err);
    return { imageUrl: thumbnailUrl, attribution: fallbackAttribution(sourceUrl) };
  }
}
