# OTS / R-Supply Research Findings
Date: 2026-04-15
Method: Open-source web research only (live OTS access deferred)

---

## R-Supply Technical Documentation

**What it is:** R-Supply is a subsystem within NTCSS (Navy Tactical Command Support System), the legacy client-server suite that includes NALCOMIS (aviation maintenance), R-Supply (supply management), and OMMS-NG (organizational maintenance).

**Public documentation found:** None. Zero results on:
- GitHub (0 repos matching "R-Supply NTCSS", "NALCOMIS Navy supply")
- DTIC (apps.dtic.mil blocks unauthenticated API access — HTTP 403)
- code.mil (DoD open source portal — 404)
- data.mil (DNS does not resolve)

**What is known from domain knowledge:**
- R-Supply interfaces with DAAS (Defense Automatic Addressing System) via DLMS transactions
- R-Supply is a NAVSUP Business Systems Center (NAVSUP BSC) product; technical docs are controlled distribution
- NTCSS Interface Control Documents (ICDs) exist but are not publicly available — distributed to authorized contractors via NAVSUP BSC only
- The system communicates with OTS via DLMS X12 transactions over a MIL-STD data network, not a public internet API

**NAVSUP BSC (program owner):**
- URL: https://www.navsup.navy.mil/NAVSUP-Enterprise/NAVSUP-Business-Systems-Center/ (CAC-gated)
- Support: NESD 1-833-NESDNOW | nesd@nesd-mail.onbmc.mil

---

## OTS Interface Information

**What OTS is:** One Touch Support is a DLA web portal and transaction processing layer that aggregates supply requisition status across DLA, GSA, and service supply systems. Accessed at ots.dla.mil — CAC required.

**Public API documentation found:** None. OTS has no published REST API, no open SDK, no public interface spec. The OTS portal is behind CAC authentication (TLS client certificate) and not reachable without a valid DoD credential.

**How OTS actually works (inferred from DLMS documentation):**
OTS is a front-end aggregator over DAAS (Defense Automatic Addressing System). DAAS is the authoritative transaction router for all DoD supply transactions. The underlying flow:

1. Requisition submitted -> DLMS 511R transaction -> routed via DAAS
2. Source of supply processes -> generates DLMS 869/870-series supply status transactions
3. Status transactions route back through DAAS -> OTS aggregates and displays them
4. R-Supply at the unit level receives 870S supply status from DAAS

**The key insight:** OTS is a human-readable web overlay on DAAS. The machine-readable channel is DAAS itself, with transaction formats publicly documented by DEDSO.

**DAAS Manual (publicly available, no auth):**
https://www.dla.mil/Portals/104/Documents/DLMS/Manuals/DLM/DAAS/DAAS.pdf

---

## NALCOMIS / NTCSS Docs

NAVAIR NALCOMIS page (navair.navy.mil/logistics/nalcomis) returns HTTP 403 — CAC-gated or internal only.

No public interface specs found for NALCOMIS-to-R-Supply or NALCOMIS-to-OTS data exchange. ICDs exist but are controlled distribution through NAVAIR PMA-205.

NTCSS program owner: NAVSUP Business Systems Center, Mechanicsburg PA

---

## GitHub / Open Source Projects

**Result: Zero.** GitHub API searches returned 0 repositories for all queries:
- R-Supply NTCSS
- NALCOMIS Navy supply
- One Touch Support DoD supply
- MILSTRIP OTS requisition

No contractor-published code, no government open-source projects, no research repos. NTCSS/R-Supply/OTS have no open-source footprint.

---

## DLMS — The Actual Machine Interface

The publicly documented interface layer is **DLMS (Defense Logistics Management Standards)**, published by **DEDSO (Defense Enterprise Data Standards Office)** at https://www.dla.mil/Defense-Data-Standards/

### Relevant Transaction Types for Status Queries

| IC    | Title                                | Relevance                                          |
|-------|--------------------------------------|----------------------------------------------------|
| 511R  | Requisition                          | Submit requisition (DLMS equivalent of MILSTRIP AF_) |
| 511M  | Requisition Modification             | Modify existing requisition                        |
| 869F  | Requisition Follow-up                | Request status on a document number — the programmatic "query for status" |
| 870S  | Supply Status                        | Status response inbound to requestor               |
| 870M  | Materiel Returns Supply Status       | Returns-specific status                            |
| 870L  | Special Program Requirements Status  | SPR-specific status                                |

**The 869F is the key transaction.** It is the DLMS equivalent of a MILSTRIP AF_ follow-up — submit an 869F with a document number to DAAS, and DAAS routes it to the source of supply, which replies with an 870S.

### Primary Reference Documents (all publicly accessible, no auth required)

- DLMS Vol 2, Supply Standards and Procedures (complete):
  https://www.dla.mil/Portals/104/Documents/DLMS/Manuals/DLM/V2/Volume2.pdf

- Chapter 5 — Status Reporting:
  https://www.dla.mil/Portals/104/Documents/DLMS/Manuals/DLM/V2/0105-v2c5.docx

- Appendix 8.5 — Requisition Follow-up (legacy MILSTRIP format reference):
  https://www.dla.mil/Portals/104/Documents/DLMS/Manuals/DLM/V2/0208.05-v2a8.05.docx

- Appendix 8.10 — Supply Status format:
  https://www.dla.mil/Portals/104/Documents/DLMS/Manuals/DLM/V2/0208.10-v2a8.10.docx

- DLMS 511R IC (X12 PDF, Feb 2026):
  https://www.dla.mil/Portals/104/Documents/DLMS/TransFormats/Supplements/4010/004010F511R5RA73_Feb0926_ADC_1524.pdf

- DLMS 869F IC (X12 PDF, Feb 2026):
  https://www.dla.mil/Portals/104/Documents/DLMS/TransFormats/Supplements/4010/004010F869F3FA57_Feb1626_ADC_1524.pdf

- DAAS Manual:
  https://www.dla.mil/Portals/104/Documents/DLMS/Manuals/DLM/DAAS/DAAS.pdf

- DEDSO IC Index (all DLMS transaction types):
  https://www.dla.mil/Defense-Data-Standards/Resources/Implementation-Conventions/

**Note:** MILSTRIP legacy formats (DLM 4000.25-1/2) are **decommissioned** — archived for historical reference only. All current systems use DLMS X12 per the DLM 4000.25 series.

**Note:** DEDSO explicitly warns that DLMS XML schemas omit conditional logic from the X12 ICs. Always read the X12 IC PDFs for full transaction rules, not just the XSD files.

---

## Key Findings Summary

- **No public API for OTS or R-Supply exists.** No documented REST/SOAP endpoint, no published ICD, no open-source code. Both are closed DoD systems behind CAC or authorized DAAS participation.

- **The machine interface IS documented — it's DLMS via DAAS.** DAAS is the transaction router OTS sits in front of. The DLMS Implementation Conventions (X12 format, DEDSO/dla.mil) fully document how to submit status queries using the same transaction types R-Supply uses internally. Long-term correct path is DAAS participation using 869F/870S.

- **Near-term viable path is Puppeteer/HTTP with CAC passthrough against ots.dla.mil.** OTS is a web UI with TLS client cert auth. A session can be established via TLS mutual auth and document status scraped or intercepted from XHR. Fastest path to a working MVP without requiring DAAS program enrollment.

---

## Recommendation (preliminary — pending live OTS inspection)

- [x] **Puppeteer with CAC passthrough (scraping)** — Most viable near-term path. OTS is a web UI (ots.dla.mil) with TLS client cert auth. Puppeteer or a headless browser can authenticate and extract document status. Fragile if UI changes, but requires no formal agreement.
- [ ] **Direct HTTP with session cookie** — Possible if OTS issues a session cookie post-CAC-auth. Requires live inspection to confirm session model.
- [ ] **Direct HTTP with client cert on every request** — Cleaner than Puppeteer if OTS is stateless mTLS. Only determinable with live access.
- [ ] **API-based (undocumented endpoint)** — No public endpoint found, but OTS may have internal JSON/XHR calls worth intercepting during a live session.
- [ ] **DAAS participation (DLMS 869F/870S)** — Architecturally correct, what R-Supply actually does. Requires DoDAAC + DAAS connectivity agreement + formal program enrollment. Long-term target post-contract, not MVP path.

---

## Open Questions (for when live OTS access is available)

1. Does OTS return structured data (JSON XHR) or only HTML? If there are XHR calls, we have a direct API target without scraping.
2. What is the URL structure for document status queries? Predictable path or form POST?
3. Does OTS use session cookies after initial CAC auth, or does it require the client cert on every request?
4. Is auth at the TLS layer (automatable with Node.js https agent + p12 cert) or is there a DS Logon / DoD ID redirect requiring full browser?
5. What data fields does OTS return per document number? (status code, ESD, TCN, source of supply, etc.) — defines our data model.
6. Is there a bulk query path, or strictly one document number at a time?
7. Does OTS expose any export endpoint (CSV/Excel) that would be more stable than scraping rendered HTML?
8. Can network traffic be observed when R-Supply performs an OTS pull? That would reveal the actual HTTP endpoint and auth mechanism used by the Navy's own system.
