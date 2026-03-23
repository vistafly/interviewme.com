/**
 * Shared scraping logic for job board URLs.
 *
 * Supports: Indeed, Glassdoor, ZipRecruiter, LinkedIn, Google Jobs,
 * Lever, Greenhouse, Workday, Dice, Monster, SimplyHired, and generic pages.
 */

const TIMEOUT_MS = 20_000;
const MAX_TEXT_LENGTH = 12_000;

// ---------------------------------------------------------------------------
// URL cleaning — strip tracking params that trigger bot detection
// ---------------------------------------------------------------------------

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_source_platform', 'utm_creative_format',
  'fbclid', 'gclid', 'gad_source', 'gbraid', 'wbraid',
  'msclkid', 'twclid', 'li_fat_id', 'igshid', 'mc_cid', 'mc_eid',
  'ref', 'referrer', 'source', 'src',
  // Glassdoor tracking
  'ao', 'jrtk', 'cs', 'cpc', 'guid', 'ea', 'vt', 'cb', 'ctt', 'uido', 'pos',
  // ZipRecruiter tracking
  'mid', 'tsid', 'lvk',
]);

function cleanUrl(url) {
  try {
    const u = new URL(url);
    const toDelete = [];
    for (const key of u.searchParams.keys()) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) toDelete.push(key);
    }
    for (const key of toDelete) u.searchParams.delete(key);
    return u.href;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Site detection
// ---------------------------------------------------------------------------

function detectSite(hostname) {
  const h = hostname.toLowerCase();
  if (h.includes('indeed'))        return 'indeed';
  if (h.includes('glassdoor'))     return 'glassdoor';
  if (h.includes('google.com') || h.includes('google.co')) return 'google';
  if (h.includes('ziprecruiter'))  return 'ziprecruiter';
  if (h.includes('linkedin'))      return 'linkedin';
  if (h.includes('lever.co'))      return 'lever';
  if (h.includes('greenhouse'))    return 'greenhouse';
  if (h.includes('workday') || h.includes('myworkdayjobs')) return 'workday';
  if (h.includes('dice.com'))      return 'dice';
  if (h.includes('monster.com'))   return 'monster';
  if (h.includes('simplyhired'))   return 'simplyhired';
  if (h.includes('careerbuilder')) return 'careerbuilder';
  return 'generic';
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function primaryHeaders() {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control':   'no-cache',
    'Pragma':          'no-cache',
    'Referer':         'https://www.google.com/',
    'Sec-Ch-Ua':          '"Chromium";v="131", "Google Chrome";v="131", "Not-A.Brand";v="24"',
    'Sec-Ch-Ua-Mobile':   '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };
}

function fallbackHeaders() {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.google.com/',
  };
}

function mobileHeaders() {
  return {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.google.com/',
    'Sec-Ch-Ua-Mobile': '?1',
    'Sec-Ch-Ua-Platform': '"Android"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Upgrade-Insecure-Requests': '1',
  };
}

async function fetchPage(url, timeout = TIMEOUT_MS) {
  let res = await fetch(url, {
    headers: primaryHeaders(),
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  });

  // Retry with simpler headers on 403
  if (res.status === 403) {
    res = await fetch(url, {
      headers: fallbackHeaders(),
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    });
  }

  // Retry with mobile UA on 403 — some sites serve lighter, less-protected mobile pages
  if (res.status === 403) {
    res = await fetch(url, {
      headers: mobileHeaders(),
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    });
  }

  return res;
}

// ---------------------------------------------------------------------------
// Bot-block detection
// ---------------------------------------------------------------------------

function isBotBlocked(html) {
  const lower = html.substring(0, 8000).toLowerCase();
  return (
    (lower.includes('cloudflare') &&
      (lower.includes('challenge') || lower.includes('ray id') || lower.includes('cf-'))) ||
    (lower.includes('just a moment') && lower.includes('enable javascript')) ||
    lower.includes('please verify you are a human') ||
    lower.includes('pardon our interruption') ||
    lower.includes('are you a robot') ||
    (lower.includes('access denied') && !lower.includes('job') && html.length < 3000) ||
    (lower.includes('captcha') && lower.includes('verify') && html.length < 5000) ||
    // Google "sorry" / block pages
    lower.includes('having trouble accessing google') ||
    lower.includes('unusual traffic from your computer') ||
    lower.includes('our systems have detected unusual traffic') ||
    (lower.includes('send feedback') && !lower.includes('job') && html.length < 5000)
  );
}

function botBlockMessage(site) {
  const names = {
    glassdoor:     'Glassdoor',
    indeed:        'Indeed',
    linkedin:      'LinkedIn',
    google:        'Google Jobs',
    ziprecruiter:  'ZipRecruiter',
  };
  const name = names[site] || 'This site';
  return `${name} blocked automatic fetching. Open the job posting in your browser and paste the description directly.`;
}

// ---------------------------------------------------------------------------
// HTML utilities
// ---------------------------------------------------------------------------

function htmlToText(html) {
  return html
    .replace(/<\/?(p|div|br|h[1-6]|li|ul|ol|tr|section|article|dt|dd)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&dollar;/g, '$')
    .replace(/&copy;/gi, '\u00a9')
    .replace(/&raquo;/gi, '\u00bb')
    .replace(/&laquo;/gi, '\u00ab')
    .replace(/&mdash;/gi, '\u2014')
    .replace(/&ndash;/gi, '\u2013')
    .replace(/&bull;/gi, '\u2022')
    .replace(/&#\d+;/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

function stripNoise(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<select[\s\S]*?<\/select>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<button[\s\S]*?<\/button>/gi, '')
    .replace(/<input[^>]*>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    // Cookie consent / banner divs
    .replace(/<div[^>]*(?:class|id)=["'][^"']*(?:cookie|consent|gdpr|cc-banner|cc_banner|onetrust|cookielaw|privacy-banner)[^"']*["'][\s\S]*?<\/div>/gi, '')
    // Ad containers
    .replace(/<div[^>]*(?:class|id)=["'][^"']*(?:ad-container|ads-|adslot|banner-ad|google_ads)[^"']*["'][\s\S]*?<\/div>/gi, '');
}

function wordCount(str) {
  return str ? str.trim().split(/\s+/).length : 0;
}

// ---------------------------------------------------------------------------
// JSON-LD extraction (works across all sites)
// ---------------------------------------------------------------------------

function extractJsonLd(html) {
  let jobTitle = '';
  let companyName = '';
  let jdText = '';

  const blocks = html.match(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  if (!blocks) return { jobTitle, companyName, jdText };

  for (const block of blocks) {
    try {
      const raw = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
      const ld = JSON.parse(raw);
      const items = Array.isArray(ld) ? ld : ld['@graph'] ? ld['@graph'] : [ld];

      for (const obj of items) {
        if (obj['@type'] === 'JobPosting' || obj.title || obj.hiringOrganization) {
          jobTitle = jobTitle || obj.title || '';
          const org = obj.hiringOrganization;
          companyName =
            companyName || (typeof org === 'string' ? org : org?.name) || '';
          if (obj.description && !jdText) {
            jdText = htmlToText(obj.description);
          }
        }
      }
    } catch { /* malformed JSON-LD, skip */ }
  }
  return { jobTitle, companyName, jdText };
}

// ---------------------------------------------------------------------------
// __NEXT_DATA__ extraction (Next.js sites: Indeed, Glassdoor, ZipRecruiter…)
// ---------------------------------------------------------------------------

function extractNextData(html) {
  let jobTitle = '';
  let companyName = '';
  let jdText = '';

  const match = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match) return { jobTitle, companyName, jdText };

  try {
    const data = JSON.parse(match[1]);
    const found = deepFindJob(data, 0);
    if (found) {
      jobTitle =
        found.title || found.jobTitle || found.jobTitleText || found.name || '';
      const org =
        found.hiringOrganization || found.employer || found.company;
      companyName =
        (typeof org === 'string' ? org : org?.name || org?.shortName) ||
        found.companyName ||
        '';
      jdText =
        found.description ||
        found.jobDescription ||
        found.sanitizedJobDescription ||
        found.descriptionHtml ||
        '';
      if (jdText && jdText.includes('<')) jdText = htmlToText(jdText);
    }
  } catch { /* parse error, skip */ }
  return { jobTitle, companyName, jdText };
}

function deepFindJob(obj, depth) {
  if (!obj || typeof obj !== 'object' || depth > 10) return null;
  if (
    (obj.description || obj.jobDescription || obj.sanitizedJobDescription) &&
    (obj.title || obj.jobTitle || obj.jobTitleText || obj.name)
  ) {
    return obj;
  }
  const values = Array.isArray(obj) ? obj : Object.values(obj);
  for (const val of values) {
    const found = deepFindJob(val, depth + 1);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// URL path extraction — extract title/company from URL structure when page is blocked
// ---------------------------------------------------------------------------

function extractFromUrlPath(url, site) {
  let jobTitle = '';
  let companyName = '';

  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname);

    if (site === 'ziprecruiter') {
      // Format: /c/{Company-Name}/Job/{Job-Title}/-in-{Location}
      const compMatch = path.match(/\/c\/([^/]+)/);
      if (compMatch) companyName = compMatch[1].replace(/-/g, ' ');
      const titleMatch = path.match(/\/Job\/([^/]+)/);
      if (titleMatch) jobTitle = titleMatch[1].replace(/-/g, ' ');
    }

    if (site === 'glassdoor') {
      // Format: /job-listing/{slug}-JV_IC{id}_KO{s},{e}_KE{s2},{e2}.htm
      const gdMatch = path.match(/\/job-listing\/(.+?)-JV_IC/);
      if (gdMatch) {
        const slug = gdMatch[1].replace(/-/g, ' ');
        // KO = title char range, KE = employer char range within the slug
        const koMatch = path.match(/KO(\d+),(\d+)/);
        const keMatch = path.match(/KE(\d+),(\d+)/);
        if (koMatch && keMatch) {
          const titleEnd = parseInt(koMatch[2], 10);
          const compStart = parseInt(keMatch[1], 10);
          jobTitle = slug.substring(0, titleEnd).trim();
          companyName = slug.substring(compStart).trim();
        } else {
          // Fallback: last 2-3 words are usually the company
          const words = slug.split(' ');
          if (words.length > 3) {
            companyName = words.slice(-2).join(' ');
            jobTitle = words.slice(0, -2).join(' ');
          } else {
            jobTitle = slug;
          }
        }
      }
    }

    if (site === 'indeed') {
      // Indeed viewjob pages don't have title in URL, but search pages do
      // Format: /jobs?q={query}&l={location} or /q-{query}-l-{location}-jobs.html
      const qParam = u.searchParams.get('q');
      if (qParam) jobTitle = qParam;
    }

    if (site === 'linkedin') {
      // Format: /jobs/view/{slug}-{id}/ or /jobs/{slug}-at-{company}-{id}/
      const lnMatch = path.match(/\/jobs\/view\/([^/]+)/);
      if (lnMatch) {
        const slug = lnMatch[1].replace(/-\d+$/, '').replace(/-/g, ' ');
        const atMatch = slug.match(/^(.+?)\s+at\s+(.+)$/i);
        if (atMatch) {
          jobTitle = atMatch[1];
          companyName = atMatch[2];
        } else {
          jobTitle = slug;
        }
      }
    }

    // Title-case the extracted values
    if (jobTitle) jobTitle = titleCase(jobTitle);
    if (companyName) companyName = titleCase(companyName);
  } catch { /* skip */ }

  return { jobTitle, companyName };
}

function titleCase(str) {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(And|Or|The|In|At|Of|For|A|An|To)\b/g, (w) => w.toLowerCase())
    .replace(/^\w/, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Meta-tag fallback (og:title, <title>, og:site_name)
// ---------------------------------------------------------------------------

/** Known job board / aggregator site names — NOT actual employers */
const AGGREGATOR_NAMES = new Set([
  'careeronestop', 'indeed', 'glassdoor', 'ziprecruiter', 'linkedin',
  'monster', 'simplyhired', 'careerbuilder', 'dice', 'google',
  'usajobs', 'governmentjobs', 'jobs', 'careers', 'job search',
]);

function isAggregatorName(name) {
  return AGGREGATOR_NAMES.has(name.toLowerCase().replace(/[.\-\s]+/g, '').trim());
}

function extractMetaTags(html) {
  let jobTitle = '';
  let companyName = '';

  const ogTitle =
    html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (ogTitle) jobTitle = ogTitle[1];

  if (!jobTitle) {
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleTag) jobTitle = titleTag[1].replace(/\s*[-|–—].{0,60}$/, '').trim();
  }

  const ogSite =
    html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
  if (ogSite && !isAggregatorName(ogSite[1])) companyName = ogSite[1];

  return { jobTitle, companyName };
}

/**
 * Extract employer/company name from HTML elements — useful for generic / aggregator
 * sites where og:site_name is the board name, not the actual employer.
 */
function extractCompanyFromHtml(html) {
  // 1. Elements with class/id containing company/employer/organization/hiring
  const classPatterns = [
    /<(?:span|div|a|p|h[1-6]|strong|dd|td)[^>]*(?:class|id)=["'][^"']*(?:company[-_]?name|employer[-_]?name|hiring[-_]?(?:company|org)|org[-_]?name|posted[-_]?by)[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|a|p|h[1-6]|strong|dd|td)>/i,
    /<(?:span|div|a|p|h[1-6]|strong|dd|td)[^>]*(?:class|id)=["'][^"']*(?:company|employer|organization)[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|a|p|h[1-6]|strong|dd|td)>/i,
  ];

  for (const re of classPatterns) {
    const m = html.match(re);
    if (m) {
      const name = m[1].replace(/<[^>]+>/g, '').trim();
      if (name.length >= 2 && name.length <= 100 && !isAggregatorName(name)) {
        return name;
      }
    }
  }

  // 2. Label patterns in text: "Company: X", "Employer: X", "Organization: X"
  //    Match the label element + value element pattern common on details pages
  const labelPatterns = [
    /<(?:dt|th|label|strong|b|span)[^>]*>[^<]*(?:company|employer|organization|hiring\s+organization|posted\s+by)\s*:?\s*<\/(?:dt|th|label|strong|b|span)>\s*<(?:dd|td|span|div|a)[^>]*>\s*([\s\S]*?)\s*<\/(?:dd|td|span|div|a)>/i,
    // Inline label: "Company: Value" within the same element
    /(?:company|employer|organization)\s*:\s*([A-Z][A-Za-z0-9\s&.,'-]{1,80}?)(?:\s*[|\n<])/i,
  ];

  for (const re of labelPatterns) {
    const m = html.match(re);
    if (m) {
      const name = m[1].replace(/<[^>]+>/g, '').trim();
      if (name.length >= 2 && name.length <= 100 && !isAggregatorName(name)) {
        return name;
      }
    }
  }

  return '';
}

/**
 * Extract employer/company name from plain text content — last resort when
 * HTML element extraction and meta tags both failed.
 */
function extractCompanyFromText(text) {
  const patterns = [
    /(?:company|employer|organization|agency|department|posted\s+by)\s*:\s*([A-Z][A-Za-z0-9\s&.,''()-]{1,80})/i,
    /(?:about|join)\s+((?:the\s+)?[A-Z][A-Za-z0-9\s&]{2,50}(?:Inc|LLC|Corp|Ltd|Co|Department|Agency|Authority|District|County|City|State)\.?)\b/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const name = m[1].trim().replace(/[.,]+$/, '');
      if (name.length >= 2 && name.length <= 100 && !isAggregatorName(name)) {
        return name;
      }
    }
  }

  return '';
}

// ---------------------------------------------------------------------------
// Site-specific extractors
// ---------------------------------------------------------------------------

function extractFromIndeed(html) {
  let jobTitle = '';
  let companyName = '';
  let text = '';

  // Individual job page — main description div
  const descMatch = html.match(
    /<div[^>]*id=["']jobDescriptionText["'][^>]*>([\s\S]*?)<\/div>/i,
  );
  if (descMatch) text = htmlToText(descMatch[1]);

  // Title
  const titleMatch = html.match(
    /<h1[^>]*class=["'][^"']*(?:jobsearch-JobInfoHeader-title|jobTitle)[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i,
  );
  if (titleMatch) jobTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();

  // Company
  const compMatch =
    html.match(/<div[^>]*data-company-name[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<span[^>]*class=["'][^"']*companyName[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  if (compMatch) companyName = compMatch[1].replace(/<[^>]+>/g, '').trim();

  // Mosaic provider data (search results page with selected job)
  if (!text) {
    const mosaicMatch = html.match(
      /window\.mosaic\.providerData\["mosaic-provider-jobcards"\]\s*=\s*(\{[\s\S]*?\});\s*<\/script>/i,
    );
    if (mosaicMatch) {
      try {
        const data = JSON.parse(mosaicMatch[1]);
        const results =
          data?.metaData?.mosaicProviderJobCardsModel?.results;
        if (results?.length) {
          const job = results[0];
          jobTitle = jobTitle || job.title || job.displayTitle || '';
          companyName = companyName || job.company || '';
          text = text || job.snippet || '';
        }
      } catch { /* skip */ }
    }
  }

  // Indeed search results — job description in the right pane
  if (!text) {
    const paneMatch = html.match(
      /<div[^>]*id=["']jobsearch-ViewjobPaneWrapper["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i,
    );
    if (paneMatch) text = htmlToText(paneMatch[1]);
  }

  return { jobTitle, companyName, text };
}

function extractFromGlassdoor(html) {
  let jobTitle = '';
  let companyName = '';
  let text = '';

  // Apollo state (Glassdoor uses Apollo/GraphQL)
  const apolloMatch = html.match(
    /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/i,
  );
  if (apolloMatch) {
    try {
      const state = JSON.parse(apolloMatch[1]);
      for (const key of Object.keys(state)) {
        const val = state[key];
        if (val && (key.includes('JobView') || val.__typename === 'JobView' || val.job)) {
          const job = val.job || val;
          if (job.description) text = text || htmlToText(typeof job.description === 'string' ? job.description : job.description?.text || '');
          if (job.jobTitleText || job.title)
            jobTitle = jobTitle || job.jobTitleText || job.title;
        }
        if (val && val.__typename === 'Employer') {
          companyName = companyName || val.shortName || val.name || '';
        }
      }
    } catch { /* skip */ }
  }

  // Glassdoor description containers
  if (!text) {
    const descMatch = html.match(
      /<div[^>]*class=["'][^"']*(?:jobDescriptionContent|JobDesc|desc|job-description)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    );
    if (descMatch) text = htmlToText(descMatch[1]);
  }

  return { jobTitle, companyName, text };
}

function extractFromGoogle(html, url) {
  let jobTitle = '';
  let companyName = '';
  let text = '';

  // Google Jobs embeds some initial data in script tags — try AF_initDataCallback
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, content] of scripts) {
    if (content.includes('JobPosting')) {
      try {
        // Try to find JSON-LD embedded in the AF callback
        const ldMatch = content.match(/"@type"\s*:\s*"JobPosting"[\s\S]*?\}/);
        if (ldMatch) {
          // Attempt to extract a valid JSON object
          const start = content.lastIndexOf('{', content.indexOf('"JobPosting"'));
          if (start >= 0) {
            let depth = 0;
            let end = start;
            for (let i = start; i < content.length; i++) {
              if (content[i] === '{') depth++;
              if (content[i] === '}') depth--;
              if (depth === 0) { end = i + 1; break; }
            }
            const obj = JSON.parse(content.substring(start, end));
            jobTitle = jobTitle || obj.title || '';
            const org = obj.hiringOrganization;
            companyName = companyName || (typeof org === 'string' ? org : org?.name) || '';
            text = text || htmlToText(obj.description || '');
          }
        }
      } catch { /* skip */ }
    }
  }

  // Google embeds job details in <div class="YgLbBe"> or similar — these change often
  if (!text) {
    const detailMatch =
      html.match(/<div[^>]*class=["'][^"']*(?:YgLbBe|BjJfJf|pjBnF)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<span[^>]*class=["']HBvzbc["'][^>]*>([\s\S]*?)<\/span>/i);
    if (detailMatch) text = htmlToText(detailMatch[1]);
  }

  // Extract search query from URL as fallback hint for title
  try {
    const query = new URL(url).searchParams.get('q');
    if (query && !jobTitle) {
      jobTitle = query.replace(/\+/g, ' ').replace(/\bjobs?\b/gi, '').trim();
    }
  } catch { /* skip */ }

  return { jobTitle, companyName, text };
}

function extractFromZipRecruiter(html) {
  let jobTitle = '';
  let companyName = '';
  let text = '';

  // Individual job page
  const descMatch =
    html.match(/<div[^>]*class=["'][^"']*(?:jobDescriptionSection|job_description|job-description)[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>)?/i);
  if (descMatch) text = htmlToText(descMatch[1]);

  // Title
  const titleMatch = html.match(
    /<h1[^>]*class=["'][^"']*(?:job_title|title)[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i,
  );
  if (titleMatch) jobTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();

  // Company
  const compMatch = html.match(
    /<a[^>]*class=["'][^"']*(?:hiring_company|company_name|t_company_name)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
  );
  if (compMatch) companyName = compMatch[1].replace(/<[^>]+>/g, '').trim();

  // ZipRecruiter search result page — job description pane
  if (!text) {
    const paneMatch = html.match(
      /<div[^>]*class=["'][^"']*job_description_text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    );
    if (paneMatch) text = htmlToText(paneMatch[1]);
  }

  return { jobTitle, companyName, text };
}

function extractFromLinkedIn(html) {
  let jobTitle = '';
  let companyName = '';
  let text = '';

  // LinkedIn embeds job data in <code> blocks
  for (const [, content] of html.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/gi)) {
    try {
      const decoded = content
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      if (decoded.includes('"description"') && decoded.includes('"title"')) {
        const data = JSON.parse(decoded);
        if (data.description?.text) text = text || data.description.text;
        if (data.title) jobTitle = jobTitle || data.title;
        if (data.companyDetails?.company)
          companyName = companyName || data.companyDetails.company;
      }
    } catch { /* skip */ }
  }

  // Specific class names
  if (!text) {
    const descMatch = html.match(
      /<div[^>]*class=["'][^"']*(?:description__text|show-more-less-html__markup)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    );
    if (descMatch) text = htmlToText(descMatch[1]);
  }

  return { jobTitle, companyName, text };
}

// ---------------------------------------------------------------------------
// Search-result link extraction (to follow the first individual job link)
// ---------------------------------------------------------------------------

function findJobLinks(html, site, baseUrl) {
  const links = [];
  let origin;
  try { origin = new URL(baseUrl).origin; } catch { return []; }

  if (site === 'indeed') {
    for (const m of html.matchAll(/href=["'](\/viewjob\?jk=[^"'&]+[^"']*)["']/gi)) {
      try { links.push(new URL(m[1], origin).href); } catch { /* skip */ }
    }
    for (const m of html.matchAll(
      /href=["'](https?:\/\/[^"']*indeed[^"']*\/viewjob\?jk=[^"']+)["']/gi,
    )) {
      links.push(m[1]);
    }
  }

  if (site === 'ziprecruiter') {
    for (const m of html.matchAll(/href=["'](\/jobs\/[A-Za-z0-9_-]+\/[^"'?]*)[^"']*["']/gi)) {
      try { links.push(new URL(m[1], origin).href); } catch { /* skip */ }
    }
  }

  if (site === 'glassdoor') {
    for (const m of html.matchAll(
      /href=["']([^"']*glassdoor[^"']*\/job-listing\/[^"']+)["']/gi,
    )) {
      links.push(m[1]);
    }
    for (const m of html.matchAll(
      /href=["']([^"']*glassdoor[^"']*\/partner\/jobListing[^"']+)["']/gi,
    )) {
      links.push(m[1]);
    }
  }

  if (site === 'linkedin') {
    for (const m of html.matchAll(
      /href=["']([^"']*linkedin\.com\/jobs\/view\/[^"']+)["']/gi,
    )) {
      links.push(m[1]);
    }
  }

  return [...new Set(links)];
}

// ---------------------------------------------------------------------------
// Generic content extraction (last resort)
// ---------------------------------------------------------------------------

function extractGenericContent(html) {
  let cleaned = stripNoise(html);

  // Try to isolate the main content area
  const mainMatch =
    cleaned.match(/<main[\s\S]*?<\/main>/i) ||
    cleaned.match(/<article[\s\S]*?<\/article>/i) ||
    cleaned.match(
      /<div[^>]*(?:class|id)=["'][^"']*(?:job[-_]?desc|job[-_]?detail|job[-_]?content|posting[-_]?body|description[-_]?content|job[-_]?body|job[-_]?text|job[-_]?summary|jd[-_]?content|role[-_]?description|position[-_]?description)[^"']*["'][\s\S]*?<\/div>\s*(?:<\/div>)?/i,
    ) ||
    cleaned.match(
      /<section[^>]*(?:class|id)=["'][^"']*(?:job|posting|description|role)[^"']*["'][\s\S]*?<\/section>/i,
    );
  if (mainMatch) cleaned = mainMatch[0];

  let text = htmlToText(cleaned);

  // Filter out short lines (navigation items, breadcrumbs)
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const filtered = lines.filter((line) => line.split(/\s+/).length >= 3);
  text = filtered.join('\n');

  // Strip common website boilerplate (cookie banners, login prompts, legal text)
  return stripWebBoilerplate(text);
}

// ---------------------------------------------------------------------------
// Smart trimming — strip low-value boilerplate before applying char limit
// ---------------------------------------------------------------------------

/** Section headings that typically contain boilerplate, not core job details */
const BOILERPLATE_HEADINGS = [
  /\b(?:equal\s+(?:opportunity|employment)|eeo|non-?discrimination|affirmative\s+action)\b/i,
  /\b(?:benefits|perks|what\s+we\s+offer|our\s+benefits|compensation\s+(?:and|&)\s+benefits)\b/i,
  /\b(?:about\s+(?:the|our)\s+company|who\s+we\s+are|company\s+overview|our\s+(?:story|mission))\b/i,
  /\b(?:how\s+to\s+apply|application\s+(?:process|instructions))\b/i,
  /\b(?:disclaimer|legal\s+notice|privacy)\b/i,
];

/**
 * Strip boilerplate sections (benefits, EEO, legal) so the character budget
 * goes to actual role requirements and responsibilities.
 */
function stripBoilerplate(text) {
  const lines = text.split('\n');
  const result = [];
  let skipping = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section headings (short lines that match boilerplate patterns)
    if (trimmed.length > 0 && trimmed.length < 120) {
      const isBoilerplate = BOILERPLATE_HEADINGS.some((re) => re.test(trimmed));
      if (isBoilerplate) {
        skipping = true;
        continue;
      }
      // A new non-boilerplate heading stops the skip — headings are typically
      // short lines followed by longer content, often ending with ':'
      if (skipping && trimmed.length < 80 && /[a-z]/i.test(trimmed) &&
          !BOILERPLATE_HEADINGS.some((re) => re.test(trimmed))) {
        // Check if this looks like a new section heading (ends with colon, all caps, etc.)
        const looksLikeHeading = trimmed.endsWith(':') ||
          trimmed === trimmed.toUpperCase() ||
          /^(?:requirements|qualifications|responsibilities|duties|skills|experience|education|about\s+(?:the|this)\s+(?:role|position|job))/i.test(trimmed);
        if (looksLikeHeading) {
          skipping = false;
        }
      }
    }

    if (!skipping) {
      result.push(line);
    }
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------
// Web boilerplate filtering — strip cookie banners, login prompts, legal text
// ---------------------------------------------------------------------------

/** Line-level patterns that indicate website boilerplate, not job content */
const WEB_BOILERPLATE_PATTERNS = [
  // Cookie / privacy / consent
  /\bcookie\s*(categor|setting|preference|consent|policy|notice|banner)/i,
  /\bopt[- ]?out\b.*\b(cookie|ads?|banner|tracking)\b/i,
  /\b(advertising|functional(?:ity)?|strictly\s+necessary|analytics?)\s+cookies?\b/i,
  /\bcookies?\s+allow\s+(delivery|our\s+website|you)\b/i,
  /\bbrowser\s+cookies?\s+(?:also\s+)?make\b/i,
  /\b(untick|uncheck)\b.*\b(checkbox|tickbox)\b/i,
  /\bsave\s*[/&]\s*update\s*(your\s*)?(setting|preference)/i,
  /\bnon-?personali[sz]ed\s*(google\s*)?ads?\b/i,
  /\bbanner\s*ads?\s*(being\s+)?display/i,
  /\bpersonali[sz]ed\s+google\s+ads\b/i,
  /\benable\s+the\s+tracking\s+of\s+each\s+logged[- ]?in\b/i,
  /\bnecessary\s+cookies?\s+allow\b/i,
  /\bsite\s+cookies?\s+help\s+to\s+ensure\b/i,
  // Login / register / post-a-job UI
  /\b(register|sign\s*up)\s*(here\s*)?(to\s+apply|for\s+jobs?)\b/i,
  /\b(login|log\s*in)\s+area\b/i,
  /\bpost\s+a\s+job\b/i,
  /\bsearch\s+database\s+of\b.*\bjobs?\b/i,
  /\bsearch\s+(for\s+)?(further|more)\s+jobs?\b/i,
  /\bjobs?\s+by\s+category\b/i,
  /\bapply\s+for\s+jobs?\s*-?\s*jobseeker\b/i,
  /\bjobseeker\s*\/\s*employer\b/i,
  /\bfree\s+job\s+posting\b/i,
  /\bsearch\s+categories\b/i,
  // Copyright / trademark / legal footer
  /(?:\u00a9|©|&copy;)\s*\d{4}\b/,
  /\ball\s+business\/?brand\s+names?\s*(or\s+images?\s+)?found\s+herein\b/i,
  /\bregistered\s+trademarks?\s+of\s+their\s+(original\s+)?owners\b/i,
  /\bnot\s+affiliated\s+with\s+any\s+employer\b/i,
  /\btransferred\s+to\s+a\s+third[- ]party\s+website\b/i,
  /\bfind\s+&?\s*apply\s+for\s+(expat|english\s+teaching)\s+jobs?\b/i,
  /\bjob\s+posting\s+web\s+site\b/i,
  // Site self-promo / navigation / CTA
  /\bgood\s+interactions\s+over\s+\d+\s+years?\b/i,
  /\bview\s+this\s+new\b.*\bopening\s+in\b/i,
  /\bapply\s+(?:now|for\s+jobs?)\s+(?:or|and)\s+learn\s+more\b/i,
  /\bto\s+apply\s+now\s+or\s+learn\s+more\b/i,
  /\bgo\s+to\s+the\s+application\s+page\b/i,
  /\bapply\s+for\s+jobs?\s+in\s+your\s+niche\b/i,
  /^start\s+here\s*>*$/i,
  /^interested\s+in\s+this\s+opportunity\s*\??$/i,
  /^(?:apply\s+now|learn\s+more)\s*!?$/i,
  // Generic site nav fragments
  /^(?:apply\s+to\s+job|post\s+a\s+job|register\s+here|login|sign\s+in)$/i,
  /^education\s*\/\s*teaching$/i,
];

/**
 * Remove lines that are clearly website boilerplate (cookies, legal, nav)
 * rather than job description content.
 */
function stripWebBoilerplate(text) {
  const lines = text.split('\n');
  const cleaned = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true; // keep blank lines for structure
    return !WEB_BOILERPLATE_PATTERNS.some((re) => re.test(trimmed));
  });
  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Scrape a job-posting URL and return extracted text, job title, and company.
 *
 * @param {string} url  - The URL to scrape
 * @param {number} depth - Internal recursion guard (do not pass manually)
 * @returns {Promise<{text: string, jobTitle: string, companyName: string}>}
 */
export async function scrapeJobUrl(url, depth = 0) {
  const cleaned = depth === 0 ? cleanUrl(url) : url;
  const parsed = new URL(cleaned);
  const site = detectSite(parsed.hostname);

  // ---------- Google Search / Google Jobs — not scrapable ----------
  // Google Search results and Google Jobs panels load job data client-side via JS.
  // Server-side fetch will never get the job content — reject early with a clear message.
  if (site === 'google' && (parsed.pathname === '/search' || parsed.pathname.startsWith('/search'))) {
    throw Object.assign(
      new Error(
        'Google Jobs listings cannot be fetched automatically — the job data loads via JavaScript. Click the job listing to visit the original posting, then paste that URL or the description directly.',
      ),
      { status: 422 },
    );
  }

  // Extract metadata from URL path early — useful as fallback even when page is blocked
  const urlMeta = extractFromUrlPath(cleaned, site);

  // ---------- Indeed vjk shortcut ----------
  if (depth === 0 && site === 'indeed' && parsed.searchParams.get('vjk')) {
    const vjk = parsed.searchParams.get('vjk');
    const directUrl = `${parsed.origin}/viewjob?jk=${vjk}`;
    try {
      const result = await scrapeJobUrl(directUrl, depth + 1);
      if (wordCount(result.text) >= 30) return result;
    } catch { /* fall through to normal flow */ }
  }

  // ---------- Fetch ----------
  const response = await fetchPage(cleaned);

  // On 403/401 — return URL-derived metadata if available
  if (!response.ok && (response.status === 403 || response.status === 401)) {
    if (urlMeta.jobTitle || urlMeta.companyName) {
      return {
        text: '',
        jobTitle: urlMeta.jobTitle,
        companyName: urlMeta.companyName,
        partial: true,
        message: `${botBlockName(site) || parsed.hostname} blocked automatic fetching, but we extracted the job title and company from the URL. Please paste the job description manually.`,
      };
    }
    throw Object.assign(new Error(botBlockMessage(site)), { status: 502 });
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw Object.assign(
        new Error('Job posting not found — it may have been removed or the link has expired.'),
        { status: 404 },
      );
    }
    // For other error statuses, still try URL metadata
    if (urlMeta.jobTitle || urlMeta.companyName) {
      return {
        text: '',
        jobTitle: urlMeta.jobTitle,
        companyName: urlMeta.companyName,
        partial: true,
        message: `Could not fetch the page (HTTP ${response.status}), but we extracted the job title and company from the URL. Please paste the job description manually.`,
      };
    }
    throw Object.assign(
      new Error(`Could not fetch URL (HTTP ${response.status} from ${parsed.hostname})`),
      { status: 502 },
    );
  }

  const contentType = response.headers.get('content-type') || '';

  // Handle JSON responses (some APIs/embeds return JSON directly)
  if (contentType.includes('application/json')) {
    try {
      const json = await response.json();
      const text = JSON.stringify(json, null, 2).slice(0, MAX_TEXT_LENGTH);
      return { text, jobTitle: urlMeta.jobTitle, companyName: urlMeta.companyName };
    } catch {
      throw Object.assign(new Error('Could not parse JSON response'), { status: 502 });
    }
  }

  if (
    !contentType.includes('text/html') &&
    !contentType.includes('text/plain') &&
    !contentType.includes('application/xhtml')
  ) {
    throw Object.assign(new Error('URL did not return an HTML page'), { status: 400 });
  }

  const html = await response.text();

  // ---------- Bot-block check ----------
  if (isBotBlocked(html)) {
    if (urlMeta.jobTitle || urlMeta.companyName) {
      return {
        text: '',
        jobTitle: urlMeta.jobTitle,
        companyName: urlMeta.companyName,
        partial: true,
        message: `${botBlockName(site) || parsed.hostname} blocked automatic fetching, but we extracted the job title and company from the URL. Please paste the job description manually.`,
      };
    }
    throw Object.assign(new Error(botBlockMessage(site)), { status: 502 });
  }

  if (html.length < 500 && !html.includes('JobPosting')) {
    if (urlMeta.jobTitle || urlMeta.companyName) {
      return {
        text: '',
        jobTitle: urlMeta.jobTitle,
        companyName: urlMeta.companyName,
        partial: true,
        message: `${parsed.hostname} returned a minimal page, but we extracted the job title and company from the URL. Please paste the job description manually.`,
      };
    }
    throw Object.assign(
      new Error(
        `${parsed.hostname} returned an empty or blocked page. Try pasting the job description directly.`,
      ),
      { status: 502 },
    );
  }

  // ====================================================================
  // Extraction pipeline — try sources from most to least reliable
  // ====================================================================

  let jobTitle = '';
  let companyName = '';
  let jdText = '';

  // 1. JSON-LD (highest quality, standard across many boards)
  const ld = extractJsonLd(html);
  jobTitle = ld.jobTitle;
  companyName = ld.companyName;
  jdText = ld.jdText;

  // 2. __NEXT_DATA__ (Next.js sites — Indeed, Glassdoor, ZipRecruiter, etc.)
  if (wordCount(jdText) < 30) {
    const nd = extractNextData(html);
    jobTitle = jobTitle || nd.jobTitle;
    companyName = companyName || nd.companyName;
    if (wordCount(nd.jdText) > wordCount(jdText)) jdText = nd.jdText;
  }

  // 3. Site-specific extraction
  if (wordCount(jdText) < 30) {
    let sr = { jobTitle: '', companyName: '', text: '' };
    switch (site) {
      case 'indeed':       sr = extractFromIndeed(html);       break;
      case 'glassdoor':    sr = extractFromGlassdoor(html);    break;
      case 'google':       sr = extractFromGoogle(html, url);  break;
      case 'ziprecruiter': sr = extractFromZipRecruiter(html); break;
      case 'linkedin':     sr = extractFromLinkedIn(html);     break;
    }
    jobTitle = jobTitle || sr.jobTitle;
    companyName = companyName || sr.companyName;
    if (wordCount(sr.text) > wordCount(jdText)) jdText = sr.text;
  }

  // 4. If still thin, this may be a search-results page — follow the first job link
  if (depth === 0 && wordCount(jdText) < 30 && site !== 'generic') {
    const jobLinks = findJobLinks(html, site, url);
    if (jobLinks.length > 0) {
      try {
        const sub = await scrapeJobUrl(jobLinks[0], depth + 1);
        if (wordCount(sub.text) >= 30) return sub;
      } catch { /* continue with what we have */ }
    }
  }

  // 5. Meta-tag fallback for title / company
  if (!jobTitle || !companyName) {
    const meta = extractMetaTags(html);
    jobTitle = jobTitle || meta.jobTitle;
    companyName = companyName || meta.companyName;
  }

  // 5b. HTML element extraction for company (aggregator sites like CareerOneStop)
  if (!companyName) {
    companyName = extractCompanyFromHtml(html);
  }

  // 6. URL path fallback for title / company
  jobTitle = jobTitle || urlMeta.jobTitle;
  companyName = companyName || urlMeta.companyName;

  // Decode HTML entities in metadata (meta tags can contain &amp; etc.)
  const decodeEnt = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  if (jobTitle) jobTitle = decodeEnt(jobTitle);
  if (companyName) companyName = decodeEnt(companyName);

  // 7. If structured sources yielded enough text, return it
  if (wordCount(jdText) >= 30) {
    // Last-resort company extraction from the text content itself
    if (!companyName) companyName = extractCompanyFromText(jdText);
    let cleaned = jdText.length > MAX_TEXT_LENGTH ? stripBoilerplate(jdText) : jdText;
    const trimmed =
      cleaned.length > MAX_TEXT_LENGTH
        ? cleaned.slice(0, MAX_TEXT_LENGTH) + '...'
        : cleaned;
    return { text: trimmed, jobTitle, companyName };
  }

  // 8. Last resort — generic HTML extraction
  let text = extractGenericContent(html);
  if (!companyName) companyName = extractCompanyFromText(text);
  if (text.length > MAX_TEXT_LENGTH) text = stripBoilerplate(text);
  const trimmed =
    text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) + '...' : text;

  if (wordCount(trimmed) >= 10) {
    return { text: trimmed, jobTitle, companyName };
  }

  // Nothing worked — return URL metadata if we have it
  if (jobTitle || companyName) {
    return {
      text: '',
      jobTitle,
      companyName,
      partial: true,
      message: `Could not extract a job description, but we got the job title and company. Please paste the description manually.`,
    };
  }

  const siteName = botBlockName(site) || parsed.hostname;
  throw Object.assign(
    new Error(
      `Could not extract a job description from ${siteName}. This page may require JavaScript to load. Try copying and pasting the description directly.`,
    ),
    { status: 422 },
  );
}

function botBlockName(site) {
  return {
    glassdoor:     'Glassdoor',
    indeed:        'Indeed',
    linkedin:      'LinkedIn',
    google:        'Google Jobs',
    ziprecruiter:  'ZipRecruiter',
  }[site] || '';
}
