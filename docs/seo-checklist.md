# SEO checklist

Production tasks that remain after the site metadata, robots file, and sitemap are in the repository. This checklist does not promise a Google ranking.

## Before the first production build

- Set `IPO_SINGH_SITE_URL` to the public `https` origin, with no path, query, or credentials. Canonical URLs, Open Graph URLs, the sitemap, and structured-data URLs use this value. Leave it unset in development rather than inventing a domain.
- Set `IPO_SINGH_API_ORIGIN` to the IPO Singh API. Public pages must not call IPO Guru.
- Build and start the web app with those variables present. `next build` reads `IPO_SINGH_SITE_URL` into static metadata. A build without it leaves `metadataBase` unset.
- Confirm `/robots.txt` allows `/` and disallows `/search`, `/account`, `/watchlist`, `/design-system`, `/gmp`, `/subscription`, `/api/`, and URLs that contain `?`.
- Confirm `/sitemap.xml` lists the homepage, Mainboard, SME, calendar, listed history, comparison landing page, and each stored IPO at `/ipos/{slug}`. It must not list search queries, month variants, comparison selections, or filter pages.
- The sitemap stops after 1,000 stored summaries (10 pages of 100). If the catalogue grows past that, raise the shared catalogue page cap before expecting every IPO in the sitemap.
- A missing or invalid IPO slug returns HTTP **404** with noindex metadata (`notFound()`). The page says that no stored issue uses that address and does not substitute another company. Catalogue-unavailable errors stay soft (non-404) and noindex so a temporary API outage is not treated as a permanent removal.
- Do not redirect a removed IPO to a different company.

## After deployment

- Add the site in Google Search Console and verify ownership with the method Google gives that property (DNS or HTML file). Do this only on the deployed origin.
- Submit `https://<public-origin>/sitemap.xml` in Search Console.
- Use URL Inspection on `/`, `/ipos/mainboard`, `/ipos/sme`, `/ipo-calendar`, `/ipos/listed`, `/compare`, and one real IPO detail URL.
- Check the Page indexing report for excluded search, account, watchlist, and design-system URLs.
- Review Core Web Vitals in Search Console after Google has field data. Lab checks do not replace that report.
- Re-submit the sitemap after the first catalogue sync so new IPO URLs are discovered. Do not create placeholder IPO pages to fill the sitemap.

## Markup that stays out

- Do not add reviews, ratings, or star counts.
- Do not add prices, GMP, subscription totals, or listing gains that are not stored.
- Do not describe GMP as a listing gain.
- Do not generate a page per filter, month, or comparison combination for search engines.
