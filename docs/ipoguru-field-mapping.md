# IPO Guru v2 field mapping

Audit date: 19 October 2026. Source: <https://www.ipoguru.in/ipo-gmp-details-developer-api>.

Domain types live in `packages/contracts` and `packages/core`. Persistence records live in `apps/api/src/db/records.ts`. A vendor field maps only where a domain field already exists. This document does not add fields.

Store the v2 slug as `providerMappings[].externalId` with `providerKey` `ipo-guru`. v2 exposes no numeric id. The IPO Singh id stays an internal stable id. Until a separate company id is published, `companyId` remains the IPO id.

## Mainboard and SME

| Vendor | IPO Singh |
| --- | --- |
| `type` value `Mainboard` | `board` `mainboard` |
| `type` value `SME` | `board` `sme` |
| Query `type=mainboard` or `type=sme`, case-insensitive | Filter on `board` |

Any other `type` string is unsupported. Do not infer a board from the name.

The glossary says mainboard issues list on the NSE/BSE main platform, and SME issues list on NSE Emerge or BSE SME. `issue.listing_on` is a separate free-text field (example `BSE, NSE`). It is not the board enum.

SME detail documents have an empty `kpis` array because the upstream source has no KPI column. An empty array is an empty list, not a failed request.

`sub_type` is usually `Equity` and may be null. IPO Singh has no instrument field.

## Status

Response `status` is `Upcoming`, `Open`, or `Closed`, computed against today in IST.

`is_listed` is true once the listing date has passed. The list filter `status=listed` is a query value. The response enum printed on the page does not include `Listed`.

| Vendor | IPO Singh `status` |
| --- | --- |
| `Upcoming` | `upcoming` |
| `Open` | `open` |
| `Closed` and `is_listed` false, before the allotment date or with a null allotment date | `closed` |
| `Closed`, `is_listed` false, today in IST is on or after `allotment_date` and before `listing_date` | `allotment` |
| `is_listed` true | `listed` |

`allotment` is an IPO Singh lifecycle value. v2 does not send it. Derive it from the dates above. A closed issue with a null allotment date stays `closed`.

`stage` `pre_rhp` with `dates_tba` true is a mainboard issue quoted before its dates are announced. Map the status to `upcoming` and leave dates, price band, and lot size null. Do not invent an open date.

`stage` `live` needs no extra domain field.

## Null, zero, and blank

The reference states that null means unknown, and a GMP of `"0"` is a real nil premium.

| Published value | Meaning | Domain |
| --- | --- | --- |
| `null` | Unknown | `null` |
| GMP `price` `"0"` | Grey market priced the premium at nil | `amountRupees` `0` |
| Subscription `times` `"0"` with `times_value` `0` | Exchange published zero. The history example uses `"0"` for employee and shareholder | `0` |
| Subscription `times` `""` with `times_value` `null` | Exchange published a blank | `null` |
| Summary `anchor: null` beside `employee: "0"` | Anchor unknown, employee zero | Keep them distinct |
| `amount` on a subscription category | Legacy, always null | Ignore. There is no domain field for `demand_crore` |
| GMP history `timeline: []` below Pro | Withheld intraday series, also named in `locked` | Empty intraday history, not a zero premium |
| Omitted block named in `locked` | Plan gate on an otherwise successful 200 | Do not replace the missing block with zeros |
| `dates_tba` true | Dates, price band, and lot size are null | `null`, not zero |
| OFS `discount` `"0.00"` in the example | Published zero string | Future OFS model only |

A failed numeric parse stays null. It must not become zero.

## Dates and IST

Plain dates are `YYYY-MM-DD`. They map to the calendar-date fields on `dates` and `listing.listedOn`.

| Vendor date | Domain |
| --- | --- |
| `open_date` | `dates.openDate` |
| `close_date` | `dates.closeDate` |
| `allotment_date` | `dates.allotmentDate` |
| `listing_date` | `dates.listingDate` and `listing.listedOn` |
| `refund_date` | `profile.refundDate` |
| `credit_to_demat_date` | `profile.dematCreditDate` |

Timestamps that end in `Z` are UTC ISO-8601. `gmp.updated_at` and `subscription.summary.updated_at` are documented as UTC. Store that instant as `observedAt` and as the source observation time. Display it in Asia/Kolkata. The `_label` fields are the same moment already formatted in IST. Display the label as text. Do not parse it as a timestamp.

The FAQ says every GMP and subscription block carries an `updated_at` timestamp in IST. The field reference and the captured examples mark those values with `Z` and call them UTC, and they put IST in `updated_at_label`. Implement the field reference. Do not shift a `Z` timestamp a second time.

Business day, quota reset, and slot hours are IST. `usage_today.resets_at` and the 429 `resets_at` are IST display strings (example `23 Sep 2026, 12:00 AM IST`), not ISO timestamps.

`timeline[].recorded_at` in the captured example is `2026-08-31 10:48:02`, twelve minutes before the published 11 AM IST slot. The page does not print an offset. Slot hours 11, 17, and 22 are IST, so that civil time is stored as Asia/Kolkata and converted to UTC once. It is not shifted again. `slot_label` is kept as published text.

Subscription history `time` is `HH:MM:SS` IST on `date` `YYYY-MM-DD`. When both are present, the observation time is that civil time in Asia/Kolkata. When `time` is null, `observedAt` is null. Do not substitute midnight.

OFS `open_date` and `close_date` are ISO timestamps in the example, including `Z`. They are not IPO calendar dates.

## GMP amount, percentage, and implied price

Current GMP block on `GET /gmp`, `GET /ipos/{slug}/gmp`, and the `gmp` object inside the list and detail:

| Vendor field | Published type | Domain |
| --- | --- | --- |
| `gmp.price` | string or null, rupees over the cap price | `amountRupees` after a finite parse. Commas may appear in money strings. A failed parse is null. |
| `gmp.percentage` | string or null, premium as a percentage of the cap price (`price_max`) | Cross-check only. The stored `percent` is `gmpPercent` from `@ipo-singh/core`. |
| `gmp.estimated_listing_price` | number or null, `price_max + gmp.price` | Cross-check only. The stored `indicativeImpliedPriceRupees` is `indicativeGmpImpliedPrice`. |
| `gmp.updated_at` | UTC ISO-8601 or null | `observedAt` |
| `gmp.updated_at_label` | IST display string or null | Display text, not a stored instant |
| `gmp.kostak` | string or null, featured issues only | No domain field |
| `gmp.subject_to_sauda` | string or null, about 30 issues, may contain several comma-separated figures as published (example `700,,9800`) | No domain field |

Captured percentage strings differ. The hero example is `"29.17%"`. The field examples are `"5.07"` and `"23.19"` with no percent sign. A cross-check parser accepts an optional trailing `%` and then a finite number. It does not invent a third format.

IPO Singh's applicable issue price is the fixed `issue_price` when that number is present, including zero, otherwise `price_max`. The vendor percentage and estimated listing price always use `price_max`. When the fixed issue price and the cap differ, the two percentages differ. Store the core calculation, keep the vendor number as a cross-check, and record a validation failure when they disagree. The implied price is indicative. The core disclaimer already says it is not a guaranteed listing price. The vendor text says the same figure is arithmetic, not a forecast.

History `trend[]` adds `price_value`, the numeric premium. Use `price_value` for the amount when it is a finite number, and keep `price` as the raw cross-check. One trend point is that day's last reading, oldest first. Map it to a GMP observation with `session` `daily`. The point has a date and no capture time. `observedOn` stores that calendar date. `observedAt` is 00:00 Asia/Kolkata on that date so the series can be ordered. The chart shows the date, not that anchor clock. A missing day is omitted. It is not stored as zero and it is not interpolated.

History `timeline[]` maps to `session` `intraday`. `recorded_at` is Asia/Kolkata civil time, as above. `slot` is 11, 17, 22, or null on the trailing live point. `slot_label` is preserved. A point with no readable `recorded_at` is dropped. No intermediate slot is created. Below Pro, `timeline` is `[]` and `locked` includes `timeline`. That is an empty intraday series, not a failure and not zeros. `summary.high` and `summary.low` are the source extremes for the returned window. They are stored beside the series and are not extra points. `truncated: true` means the plan ceiling clipped the window. `summary.issue_price` is the cap used for the vendor's derived estimates. A closed, allotment, or listed issue is not fetched again after one successful history response.

## Offer and listing

| Vendor field | Unit on the page | Domain |
| --- | --- | --- |
| `price_min` | rupees, number or null | `offer.priceBand.lowRupees` |
| `price_max` | rupees, number or null, the cap | `offer.priceBand.highRupees` |
| `price_band` | free text, example `140-148` | Do not parse. Use the numeric pair. |
| `issue_price` | string or null, rupees once fixed | `offer.issuePriceRupees` and `listing.issuePriceRupees` |
| `issue_size` | string or null, ₹ crore as published | `offer.issueSizeRupees` after multiplying a parsed crore figure by 1,00,00,000. A failed parse is null. |
| `lot_size` | integer or null, shares | `offer.lotSizeShares` |
| `min_investment` | number or null, rupees, `lot_size × price_max` | `offer.minimumInvestmentRupees` as the stored value. Display still goes through the shared investment functions. |
| `listing_price` | string or null, listing-day open, rupees | `listing.listingPriceRupees` |
| `listing_gain_percent` | number or null, 2 decimal places | Cross-check. Stored `listing.gainPercent` is recomputed from the two prices. |
| `cmp` | string or null | `profile.cmpRupees` when the string parses as rupees. A failed parse is null. |
| `current_gain_percent` | number or null, 2 decimal places | `profile.currentGainPercent` as published. It is not recomputed. |
| `face_value` | string in the detail example | No domain field |
| `sale_type` | string, example `Fresh capital cum OFS` | No domain field |
| `listing_on` | string | No domain field |
| `bse_scrip_code` | string | No domain field |
| `nse_symbol` | string, example `SKYWAYS.NS` | No public IPO field. Do not strip a suffix that the page does not define. |
| `logo` / `images.logo` / `images.feature` | absolute URL or null. Hotlinking is allowed by the vendor. | No domain field |
| `display_name` | string, falls back to `name` | No domain field. `companyName` maps from `name`. |
| `web_url` | canonical `ipoguru.in` page | Attribution link. Not a registrar URL. |

## Subscription

Live subscription is per IPO. Category order on the page: QIB, NII, Retail, Employee, Shareholder, Anchor, Total. Categories with no data are omitted. Switch on `key`, not on `label`.

Prefer `times_value`. It is null when `times` is an empty string.

| Category key | Label on the page | Domain |
| --- | --- | --- |
| `TOTAL` | Total | `totalTimes` |
| `RETAIL` | Retail Individual Investors (RII) | `retailTimes` |
| `QIB` | Qualified Institutional Buyers (QIB) | `qibTimes` |
| `NII` | Non-Institutional Investors (NII) | `niiTimes` |
| `EMPLOYEE` | Employee | `employeeTimes` |
| `SHAREHOLDER` | Shareholder | `shareholderTimes` |
| `ANCHOR` | Anchor Investors | `anchorTimes` |

The list field `subscription_total` is the same total as a string and can fill `totalTimes` when the category document has not been fetched. It does not fill the category breakdown.

Subcategory keys stay on the parent category. They are not added into the parent multiple:

| Key | Label on the page |
| --- | --- |
| `FII` | Foreign Institutional Investors |
| `DFI` | Domestic Financial Institutions |
| `MF` | Mutual Funds |
| `OTHERS` | Others |
| `BNII` | bNII, bids above ₹10 lakh |
| `BNII_CORP` | bNII, corporates |
| `BNII_IND` | bNII, individuals |
| `BNII_OTHERS` | bNII, others |
| `SNII` | sNII, bids ₹2 lakh to ₹10 lakh |
| `SNII_CORP` | sNII, corporates |
| `SNII_IND` | sNII, individuals |
| `SNII_OTHERS` | sNII, others |
| `CUTOFF` | Cut-off price bids |
| `PRICE` | Price bids |

Also present on the live document and absent from the domain:

| Vendor field | Notes |
| --- | --- |
| `applications` | String count. Retail, NII, bNII, sNII, and Total during bidding. QIB is filled after the basis of allotment. |
| `applications_source` | `boa` or the exchange feed. |
| `shares_offered`, `shares_applied` | Strings, as published. |
| `demand_crore` | Number, ₹ crore, `shares_applied × demand_price ÷ 1,00,00,000`, two decimal places. Also on subcategories. |
| `demand_price` | Upper end of the price band. |
| `qib_interest_cost` | Null until QIB bidding. `price × qib_times × rate × days ÷ 365`, `days` 7, rates 7–12%, plus `funds_per_share` and `cost_percent`. Arithmetic, not advice. |
| `amount` | Always null. |

For Mainboard issues the page says the consolidated NSE figure is already used. Do not add a BSE figure to it.

History `day_wise[]` is oldest first. `day` 1 is the opening day and may be null. Fields `qib`, `nii`, `retail`, `employee`, `shareholder`, and `total` are strings or null. There is no `times_value` twin on the history row in the published schema, and no anchor field on the history example. Map those fields with the same null-versus-zero rule. Leave anchor null when the row does not include it. When `date` and `time` are both present, `time` is `HH:MM:SS` in Asia/Kolkata. When `time` is null, `observedAt` stays null. Do not store midnight. One row is one bidding-day snapshot, not an intraday series. Application counts, share counts, `demand_crore`, and `qib_interest_cost` stay off the public subscription document.

## Detail blocks that do not fit the domain

| Block | Plan | Gap |
| --- | --- | --- |
| `company.about`, `description`, `strengths[]`, `risks[]`, promoters | Basic | `profile` narrative fields. Promoters are a string or an object with `name`, plus `profile`, `about`, or `designation` when that string is present. Holding pattern and `kpis[]` stay unmapped. SME `kpis` is empty. |
| `company.financials` | Basic | `profile.sourceFinancials`: `headers`, `rows` of `{ metric, values }`, `unit` example `Rs. Crore`, or `text` when there are no rows. The only printed metric is `Assets`. That row is not copied into revenue, profit after tax, or earnings per share. |
| `objects_of_issue` | Basic | `profile.objectsOfIssue`. Use `items` when present, otherwise `text`. Check the company block first, then a top-level object of the same name. |
| `lot_calculator` | Basic | Retail / S-HNI / B-HNI tiers. Display investment still uses the shared functions. |
| `reservation`, `shares_offered` | Basic | No domain fields. |
| `contacts.registrar` | Basic | Example fields: `name`, `slug`, `status_page`, `supports_in_app`. `name` maps to `registrar.name`. Valid `status_page` maps to `allotmentUrl` when that exact URL is an official KFin, MUFG Intime, or Bigshare allotment page. When `status_page` is missing or unofficial, a verified **general** portal from the registrar directory may be attached if the registrar identity matches uniquely. IPO-specific URLs are never guessed. `supports_in_app` does not verify the registrar. Phone, email, website, and `driver` stay unmapped; do not invent them. |
| `contacts` company and lead managers | Basic | No domain fields. |
| `documents` | Basic | RHP maps to kind `rhp`, DRHP to `drhp`, when the URL is http(s). Anchor and basis-of-allotment links have no matching kind; kind `source` can carry them with their titles. `publishedOn` is not in the published document schema, so it stays null. Links are frequently null. |
| Anchors | Standard | No provider method and no domain model. Summary: `total_anchors`, `total_amount_cr` (₹ crore), `mutual_fund_count`, `anchor_document`. Each row: `name`, `group_entity`, `shares_allotted`, `amount_cr`, `pct_allocated`, `pct_allotment_of_issue`. `groups` roll up by `group_entity`. |
| OFS and unlisted | Pro | No provider method and no domain model. See the integration audit. |

## Identity and provenance

| Vendor | IPO Singh |
| --- | --- |
| `slug` | `slug`, and `providerMappings.externalId` |
| `name` | `companyName` |
| Response `plan` plus retrieval time | `provenance.sourceName` remains `IPO Guru Pro`. `retrievedAt` is when IPO Singh fetched the document. `sourceUpdatedAt` is the vendor `updated_at` when that timestamp exists. |
| `web_url` | Attribution target, not stored as an official document |

Freshness stays IPO Singh's `missing`, `fresh`, and `stale`, computed from the source observation time and the cache policy. A successful document with a null GMP is missing, not stale and not zero.
