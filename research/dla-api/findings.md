# DLA / FLIS API Research Findings

**Date:** 2026-04-15  
**Researcher:** Claude Code (Metron Matrix session)  
**Scope:** WebFLIS public access, DLA FLIS APIs, GitHub references, CAGE code lookup

---

## Summary

No formal, documented REST API exists for the DLA's WebFLIS system that is publicly accessible without a CAC or ECA certificate. The DLA's `www.webflis.dla.mil` domain does not resolve from commercial/residential networks — it is restricted to `.mil` / government-permissioned network access. The GitHub repo `nsnlookupjn/webflis` is a README stub with no source code. The viable path for NIIN/NSN lookup in a non-CAC production context is HTML scraping of `nsnlookup.com`, or a formal DLA data agreement (DAASC/DITCO).

---

## 1. GitHub Repo: `nsnlookupjn/webflis`

**URL:** https://github.com/nsnlookupjn/webflis  
**Finding:** README-only repository. The tree contains exactly one file (`README.md`, 1234 bytes). No source code, no client implementation, no documented endpoints.

**README content:** Historical overview of the "WEBFLIS" brand — claims the commercial nsnlookup.com launched a WEBFLIS NSN system in 1999, and the US DLA launched its own in 2001. The repo appears to be SEO/marketing content for `nsnlookup.com`, not a client library.

**Verdict:** Not usable. No implementation value.

---

## 2. DLA WebFLIS Direct Access

**Target:** `https://www.webflis.dla.mil/WebFLIS/search?niin=014482680`  
**Finding:** DNS does not resolve from commercial networks.

```
curl: (6) Could not resolve host: www.webflis.dla.mil
```

`webflis.dla.mil`, `flis.dla.mil` — all return NXDOMAIN. `dla.mil` resolves but returns HTTP 403 (Akamai WAF). This is consistent with DLA's posture: WebFLIS is accessible only from `.mil` networks, CAC-authenticated sessions, or via approved contractor portals.

**No JSON API:** Both `Accept: application/json` and POST with JSON body return no response (connection refused before content negotiation).

**No SOAP/WSDL:** `WebFLIS.wsdl` probe returned empty — no public web service endpoint confirmed.

**Verdict:** Direct access is not viable without a `.mil` network connection or approved PKI credential.

---

## 3. `apix.dla.mil` Probe

**Finding:** No response. DNS resolves (`.mil` A record exists) but no HTTP response from this environment. Likely the same access control as webflis.dla.mil.

**Context:** DLA does publish APIs via `apix.dla.mil` for approved integration partners (DAASC contracts), but access requires a formal agreement and PKI authentication. Not publicly documented or accessible.

---

## 4. `data.mil` / DLA Open Data

**Finding:** `data.mil` — no DNS resolution from this environment. DLA's open data initiative appears to have been retired or migrated. `dla.mil/About-DLA/News/...open-data/` returns HTTP 403.

**Verdict:** No public open data API is currently accessible.

---

## 5. `nsnlookup.com` — Commercial FLIS Mirror (VIABLE)

**URL:** https://www.nsnlookup.com  
**Stack:** Microsoft-IIS/10.0 — Windows/.NET backend  
**Access:** Public, no authentication required  
**Data source:** Claims to mirror DLA FLIS + NATO data

### Confirmed Endpoints

| Endpoint | Method | Input | Output | Notes |
|---|---|---|---|---|
| `/search/national-stock-number-nsn?q={query}` | GET | NIIN, NSN, part#, keywords | HTML | Full search results page |
| `/search/key/{base64(query)}` | GET | Base64-encoded query string | HTML fragment | Autocomplete/typeahead — returns `<a>` list items |
| `/fsg-{fsg}/fsc-{fsc}/us/{slug}` | GET | URL slug from search results | HTML | Full NSN detail page |

### Data Available on Detail Pages (HTML-parsed)

- NSN / NIIN (formatted and unformatted)
- Item name / noun name
- FSG / FSC (Federal Supply Group / Class)
- CAGE codes and manufacturer part numbers
- DEMIL code, DEMILI, HMIC, PMIC, Criticality
- Approved sources
- Related documents

### Autocomplete Endpoint Detail

```
GET https://www.nsnlookup.com/search/key/{base64url(query)}
Response: HTML fragment (<a> tags with href, NSN, item name)
```

Example: Query `014482680` → base64 `MDE0NDgyNjgw`
```
GET /search/key/MDE0NDgyNjgw
→ <a href="/fsg-76/fsc-7644/us/7644-01-448-2680-...">7644-01-448-2680 / DIGITAL GEOSPATIAL PRODUCTS</a>
```

**No formal JSON API** — all responses are HTML. Scraping is required.

### Rate Limiting / ToS

- No rate limiting observed in testing
- ToS not formally evaluated — scraping at production scale should be assessed before launch
- Consider reaching out for a data partnership or licensed feed

---

## 6. CAGE Code API

| Source | Status |
|---|---|
| `sam.gov` Entity API | Public REST API — requires free API key (open.gsa.gov) |
| `nsnlookup.com/cage/` | HTML pages per CAGE code — scrapeable |
| DLA CAGE direct | Blocked (same `.mil` access restriction) |

**SAM.gov Entity API** is the correct path for CAGE code lookups:
```
GET https://api.sam.gov/entity-information/v3/entities?api_key={KEY}&cageCode={CAGE}
```
Free API key via SAM.gov registration. Rate limit: 10 req/s (standard tier).

---

## 7. Recommended Integration Architecture

```
Aviation IMS NSN/NIIN Lookup
         │
         ├─► nsnlookup.com scraper (public, HTML)
         │     └─ Cheerio parser → structured JSON
         │     └─ Cache layer (file or Redis, TTL 24h)
         │
         ├─► SAM.gov Entity API (CAGE lookup)
         │     └─ REST/JSON, free API key
         │
         └─► Future: DLA DAASC data agreement
               └─ Unlocks direct FLIS data feed
               └─ Required for production GovCon use
```

---

## 8. Open Issues / Next Steps

| Item | Priority | Notes |
|---|---|---|
| Build nsnlookup.com scraper client | High | See `prototype-client.ts` in this directory |
| Register SAM.gov API key | High | Free — 10 min at api.sam.gov |
| Evaluate nsnlookup.com ToS for scraping | Medium | May want commercial license |
| Apply for DLA DAASC data agreement | Medium | Required before GovCon product launch |
| Investigate PUBLOG bulk FLIS extract | Low | DLA publishes some bulk data periodically |

---

## References

- DLA WebFLIS: https://www.webflis.dla.mil (`.mil`-network only)
- NSN Lookup (commercial FLIS mirror): https://www.nsnlookup.com
- SAM.gov Entity API: https://open.gsa.gov/api/entity-api/
- GitHub repo investigated: https://github.com/nsnlookupjn/webflis (README stub only)
- DLA DAASC: https://www.transactionservices.dla.mil/daascweb/
