# IPO Guru data-rights checklist

Audit date: 19 October 2026. Source: the terms, attribution, and plan sections of <https://www.ipoguru.in/ipo-gmp-details-developer-api>.

This is an engineering checklist for go-live. It is not a legal opinion. The live provider is not connected, so none of the data obligations are in force against production traffic yet. Items marked pending must be true before `IPO_DATA_PROVIDER=ipo-guru` is allowed to call the network.

## Licence and presentation

| # | Obligation from the published terms | Status |
| --- | --- | --- |
| 1 | Free tier is evaluation and non-commercial. Production traffic uses a paid plan. | Pending. No key is configured. |
| 2 | Commercial use is allowed on a paid plan and still requires the credit link. | Pending. |
| 3 | The data is not presented as investment advice, a recommendation, or a prediction of listing gains. GMP stays indicative. | The site disclaimer and the GMP components already say the figures are indicative and not a listing promise. Re-check those surfaces when live figures replace placeholders. |
| 4 | A visible "Data by IPO Guru" link to `https://www.ipoguru.in/` appears on every website page that shows IPO Guru data. The published snippet is a normal link. The terms ask that it not be `nofollow`, `sponsored`, hidden with CSS, placed behind a click, or injected only for some visitors. | The detail GMP and subscription blocks, loaded financials, the homepage, and catalogue lists render that link when the stored source name includes IPO Guru. It is a normal link. A live page has not been checked because no key is configured. |
| 5 | A future app shows "Data: IPO Guru" on the screens that show the data, plus a link on the website or store listing. | No app is shipping IPO Guru data. |
| 6 | A missed credit can get the key paused after IPO Guru asks for it to be restored. | Operational risk for go-live. No key to pause today. |

## Key handling

| # | Obligation | Status |
| --- | --- | --- |
| 7 | One key per client. The key is not shared across organisations. | Pending, when a key is issued. |
| 8 | The key stays in the API and worker environment. It is not committed, logged, or placed in web or mobile code. | The client reads the key from the API and worker environment and sends `X-API-KEY`. Redaction covers `api_key` and authorization headers. This workspace has no key configured. |
| 9 | v1 is not called. A v1 response is `v1_retired`. | The client calls `https://www.ipoguru.in/api/v2` only. |

## Redistribution

| # | Obligation | Status |
| --- | --- | --- |
| 10 | Raw responses are not resold, redistributed, or republished as a competing data feed. | Persistence rejects raw provider payloads. Public JSON is the IPO Singh document, with provenance. Keep it that way when the client is written. |
| 11 | Cached public responses are IPO Singh's served document, still credited to IPO Guru wherever the figures appear. | Credit is pending with item 4. Cache TTLs do not remove the credit. |
| 12 | Allotment-by-PAN is not an API product. IPO Singh does not collect PAN or application numbers to work around that. | Public write fields that look like PAN or an application number are already rejected. Registrar `status_page` links, when mapped later, stay `verify-before-use` and must not become an in-app PAN form. |

## Accuracy and outages

| # | Obligation | Status |
| --- | --- | --- |
| 13 | The terms give no warranty of accuracy or uptime. Exchange, registrar, and grey-market inputs may lag. | Surface source time and freshness. A null stays unknown. A published zero stays zero. A 5xx or network failure stays an error. |
| 14 | Mainboard subscription is the consolidated NSE figure. BSE and NSE are not added together. | The subscription client stores the figure the endpoint returns. It does not add a second board. |
| 15 | `qib_interest_cost`, estimated listing price, and GMP percentage are arithmetic published by the vendor. IPO Singh recomputes GMP percent and implied price with the shared functions and labels the implied price as indicative. | Documented. The core functions already exist. The client must not present the vendor estimate as a forecast. |

## Before the first live call

1. Choose Basic, Standard, or Pro. Free cannot run the sync budget in `docs/ipoguru-request-budget.md`.
2. Set `PROVIDER_REQUESTS_PER_MINUTE` and `PROVIDER_REQUESTS_PER_DAY` to that plan. Standard is 20/minute and 1,000/day. The application default of 30/minute is above Standard.
3. Put the credit link on every surface that will show the data.
4. Keep the adapter `unverified` until the implemented feature has a tested parser. Documented gaps (financial metric names, anchors, OFS, unlisted) stay out of the public API. Shareholder and anchor subscription times, and subcategory times such as bNII and sNII, are stored when the vendor sends them. Application counts and funding-cost arithmetic are not.
5. Confirm `docs/backend-readiness.md` section 8. The documentation audit is done. The network client is not.
