'use strict';

/**
 * MILSTRIP Document Generator
 *
 * Generates fixed-format MILSTRIP transaction lines and DD-2765 output.
 * Format: DLM 4000.25-1 (MILSTRIP) — 80-character fixed-width records.
 *
 * NOTE: Column positions follow the standard A0A/AP1/AC1 format.
 * Validate against live documents before production use — column positions
 * can vary slightly by service/command convention.
 *
 * Document Types:
 *   A0A — Initial requisition (submit)
 *   AP1 — Follow-up (backorder status request)
 *   AC1 — Cancellation
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Left-pad a string with spaces to fill a field width. */
function padLeft(val, len) {
  return String(val == null ? '' : val).padStart(len, ' ');
}

/** Right-pad a string with spaces to fill a field width. */
function padRight(val, len) {
  return String(val == null ? '' : val).padEnd(len, ' ');
}

/** Zero-pad a number to a fixed width. */
function zeroPad(val, len) {
  return String(val == null ? 0 : val).padStart(len, '0');
}

/**
 * Format NSN for MILSTRIP: remove hyphens, pad to 15 chars (FSC 4 + NIIN 9 + 2 spaces).
 * NSN stored as 13-char string (e.g. "2840001248246").
 */
function formatNsn(nsn) {
  const clean = String(nsn).replace(/-/g, '').replace(/\s/g, '');
  return padRight(clean, 15);
}

/**
 * Generate Julian date in YYDDD format (e.g. 26105 for day 105 of 2026).
 * @param {Date} [date]
 * @returns {string} 5-char Julian date
 */
function julianDate(date) {
  const d = date || new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  const diff  = d - start;
  const day   = Math.floor(diff / 86400000);
  const yy    = String(d.getFullYear()).slice(-2);
  return yy + zeroPad(day, 3);
}

/**
 * Build a MILSTRIP document number.
 * Format: DODAAC(6) + JulianDate(5) + Serial(4) = 15 chars
 * Note: Schema stores this as VARCHAR(20) — safe.
 * @param {string} dodaac     - 6-char DoDAAC of ordering unit
 * @param {string} serial     - 4-char serial (zero-padded)
 * @param {Date}   [date]
 */
function buildDocumentNumber(dodaac, serial, date) {
  return padRight(dodaac, 6) + julianDate(date) + zeroPad(serial, 4);
}

// ---------------------------------------------------------------------------
// A0A — Initial Requisition
// ---------------------------------------------------------------------------

/**
 * Generate a single A0A MILSTRIP line.
 *
 * Field layout (1-indexed, 80 chars total):
 *  1-3   Document Identifier    (A0A)
 *  4-6   Routing Identifier     (RIC of ordering activity, e.g. "M35")
 *  7     Media & Status Code    (A = routine)
 *  8-22  Stock Number (NSN)     (13-char NSN right-padded to 15)
 *  23-24 Unit of Issue          (2 chars)
 *  25-28 Quantity               (4 digits, zero-padded)
 *  29-43 Document Number        (15 chars: DODAAC+Julian+Serial)
 *  44    Demand Code            (space = non-recurring; R = recurring)
 *  45-50 Supplementary Address  (DoDAAC of fund holder / RO, 6 chars)
 *  51    Signal Code            (B = bill to supplementary address)
 *  52-53 Fund Code              (2 chars, e.g. "FB")
 *  54-57 Distribution Code      (4 chars, blank if unused)
 *  58-60 Project Code           (3 chars, blank if unused)
 *  61-62 Priority Designator    (2 chars, e.g. "01"=NMCS, "03"=routine)
 *  63-65 Required Delivery Date (3 chars, "999" = no RDD)
 *  66-67 Advice Code            (2 chars, blank if unused)
 *  68-80 Blank / Management     (13 chars)
 */
function generateA0A(opts) {
  const {
    ric         = 'M35',   // Routing Identifier Code (ordering activity)
    nsn,                    // National Stock Number (13 chars, no hyphens)
    unitOfIssue = 'EA',    // Unit of Issue (2 chars)
    quantity    = 1,        // Quantity ordered
    documentNumber,         // Pre-built doc number (15 chars)
    demandCode  = ' ',      // ' ' = non-recurring, 'R' = recurring
    supAddr     = '      ', // Supplementary address (DoDAAC, 6 chars)
    signalCode  = 'B',      // Signal code
    fundCode    = '  ',     // Fund code (2 chars)
    distCode    = '    ',   // Distribution code (4 chars)
    projCode    = '   ',    // Project code (3 chars)
    priority    = '03',     // Priority designator (2 chars)
    rdd         = '999',    // Required delivery date (3 chars)
    adviceCode  = '  ',     // Advice code (2 chars)
  } = opts;

  if (!nsn)            throw new Error('A0A requires nsn');
  if (!documentNumber) throw new Error('A0A requires documentNumber');

  const line =
    'A0A'                         +  //  1-3   DI
    padRight(ric, 3)              +  //  4-6   RIC
    'A'                           +  //  7     M&S code
    formatNsn(nsn)                +  //  8-22  Stock Number (15 chars)
    padRight(unitOfIssue, 2)      +  // 23-24  UI
    zeroPad(quantity, 4)          +  // 25-28  QTY
    padRight(documentNumber, 15)  +  // 29-43  Doc Number
    padRight(demandCode, 1)       +  // 44     Demand Code
    padRight(supAddr, 6)          +  // 45-50  Supp Address
    padRight(signalCode, 1)       +  // 51     Signal Code
    padRight(fundCode, 2)         +  // 52-53  Fund Code
    padRight(distCode, 4)         +  // 54-57  Distribution Code
    padRight(projCode, 3)         +  // 58-60  Project Code
    padRight(priority, 2)         +  // 61-62  Priority
    padRight(rdd, 3)              +  // 63-65  RDD
    padRight(adviceCode, 2)       +  // 66-67  Advice Code
    ' '.repeat(13);                  // 68-80  Blank/Management

  return line.substring(0, 80);
}

// ---------------------------------------------------------------------------
// AP1 — Follow-Up
// ---------------------------------------------------------------------------

/**
 * Generate a single AP1 follow-up MILSTRIP line.
 * Same layout as A0A but DI = AP1 and quantity = original qty.
 */
function generateAP1(opts) {
  const line = generateA0A({ ...opts });
  return 'AP1' + line.substring(3);
}

// ---------------------------------------------------------------------------
// AC1 — Cancellation
// ---------------------------------------------------------------------------

/**
 * Generate a single AC1 cancellation MILSTRIP line.
 */
function generateAC1(opts) {
  const line = generateA0A({ ...opts });
  return 'AC1' + line.substring(3);
}

// ---------------------------------------------------------------------------
// DD-2765 — Consolidated Requisition List
// ---------------------------------------------------------------------------

/**
 * Generate a plain-text DD-2765 summary block.
 * Groups requisitions by NSN, totals quantities, calculates grand total.
 *
 * @param {Array} requisitions - Array of {document_number, nsn, description, quantity, unit_price, priority, fund_code}
 * @param {Object} unitInfo    - { name, dodaac, location }
 * @returns {string}
 */
function generateDD2765(requisitions, unitInfo = {}) {
  const now    = new Date();
  const lines  = [];
  const sep80  = '─'.repeat(80);
  const sep80d = '═'.repeat(80);

  lines.push(sep80d);
  lines.push('                          DD FORM 2765-1 (EDP)');
  lines.push('              UNIT REQUISITION / CONSOLIDATED SUPPLY REQUEST');
  lines.push(sep80d);
  lines.push(`  Unit:     ${padRight(unitInfo.name || '', 30)}  DoDAAC: ${unitInfo.dodaac || ''}`);
  lines.push(`  Location: ${unitInfo.location || ''}`);
  lines.push(`  Date:     ${now.toISOString().slice(0, 10)}  Julian: ${julianDate(now)}`);
  lines.push(sep80);

  // Header row
  lines.push(
    padRight('DOC NUMBER',    15) + '  ' +
    padRight('NSN',           16) + '  ' +
    padRight('DESCRIPTION',   22) + '  ' +
    padRight('PRI', 3)            + '  ' +
    padRight('QTY', 4)            + '  ' +
    padRight('UNIT $', 9)         + '  ' +
    'TOTAL $'
  );
  lines.push(sep80);

  let grandTotal = 0;

  for (const req of requisitions) {
    const qty      = parseInt(req.quantity) || 1;
    const price    = parseFloat(req.unit_price) || 0;
    const total    = qty * price;
    grandTotal    += total;

    const nsnFmt  = String(req.nsn || '').replace(/(\d{4})(\d{2})(\d{3})(\d{4})/, '$1-$2-$3-$4');
    const desc    = String(req.description || '').substring(0, 22);

    lines.push(
      padRight(req.document_number || '', 15) + '  ' +
      padRight(nsnFmt, 16)                    + '  ' +
      padRight(desc, 22)                      + '  ' +
      padLeft(req.priority || '03', 3)        + '  ' +
      padLeft(qty, 4)                         + '  ' +
      padLeft(price > 0 ? `$${price.toFixed(2)}` : 'N/A', 9) + '  ' +
      (total > 0 ? `$${total.toFixed(2)}` : 'N/A')
    );
  }

  lines.push(sep80);
  lines.push(
    padRight('GRAND TOTAL:', 67) +
    (grandTotal > 0 ? `$${grandTotal.toFixed(2)}` : 'N/A')
  );
  lines.push(`  Items: ${requisitions.length}`);
  lines.push(sep80d);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// DD-1348 — Requisition and Invoice
// ---------------------------------------------------------------------------

/**
 * Generate a plain-text DD-1348 requisition/invoice block.
 * Used for individual requisitions requiring formal documentation.
 */
function generateDD1348(req, partDetail = {}, unitInfo = {}) {
  const now   = new Date();
  const lines = [];
  const sep   = '─'.repeat(80);

  const nsnFmt = String(req.nsn || '').replace(/(\d{4})(\d{2})(\d{3})(\d{4})/, '$1-$2-$3-$4');
  const price  = parseFloat(req.unit_price || partDetail.unit_price) || 0;
  const qty    = parseInt(req.quantity) || 1;
  const total  = price * qty;

  lines.push('═'.repeat(80));
  lines.push('                    DD FORM 1348-1A — ISSUE RELEASE / RECEIPT DOCUMENT');
  lines.push('═'.repeat(80));
  lines.push(`  Document Number: ${req.document_number}`);
  lines.push(`  Date:            ${now.toISOString().slice(0, 10)}`);
  lines.push(`  Priority:        ${req.priority || '03'}`);
  lines.push(sep);
  lines.push(`  NSN:             ${nsnFmt}`);
  lines.push(`  Description:     ${partDetail.description || ''}`);
  lines.push(`  Unit of Issue:   ${partDetail.unit_of_issue || req.unit_of_issue || ''}`);
  lines.push(`  Quantity:        ${qty}`);
  lines.push(`  Unit Price:      ${price > 0 ? '$' + price.toFixed(2) : 'N/A'}`);
  lines.push(`  Total:           ${total > 0 ? '$' + total.toFixed(2) : 'N/A'}`);
  lines.push(sep);
  lines.push(`  Fund Code:       ${req.fund_code || ''}`);
  lines.push(`  JCN:             ${req.jcn || ''}`);
  lines.push(`  MCN:             ${req.mcn || ''}`);
  lines.push(`  BUNO:            ${req.buno || ''}`);
  lines.push(sep);
  lines.push(`  Requesting Unit: ${unitInfo.name || ''} (DoDAAC: ${unitInfo.dodaac || ''})`);
  lines.push('═'.repeat(80));

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// DD-1149 — Requisition and Invoice / Shipping Document
// Used for: inter-site transfers, DRMO, commercial vendor (X1 repair)
// ---------------------------------------------------------------------------

/**
 * Generate a plain-text DD-1149 shipping/transfer document.
 */
function generateDD1149(opts) {
  const {
    documentNumber,
    nsn,
    description     = '',
    quantity        = 1,
    condition       = 'RFI',
    fromUnit        = {},   // { name, dodaac, location }
    toUnit          = {},   // { name, dodaac, location } or { name: 'Commercial Vendor', contact }
    purpose         = '',   // e.g. 'REPAIRABLE EXCHANGE — X1 COMMERCIAL REPAIR'
    jcn             = '',
    mcn             = '',
    buno            = '',
    unitPrice       = null,
  } = opts;

  const now    = new Date();
  const lines  = [];
  const nsnFmt = String(nsn || '').replace(/(\d{4})(\d{2})(\d{3})(\d{4})/, '$1-$2-$3-$4');

  lines.push('═'.repeat(80));
  lines.push('                DD FORM 1149 — REQUISITION AND INVOICE / SHIPPING DOCUMENT');
  lines.push('═'.repeat(80));
  lines.push(`  Document Number: ${documentNumber}`);
  lines.push(`  Date:            ${now.toISOString().slice(0, 10)}`);
  lines.push(`  Purpose:         ${purpose}`);
  lines.push('─'.repeat(80));
  lines.push('  FROM:');
  lines.push(`    ${fromUnit.name || ''}  DoDAAC: ${fromUnit.dodaac || ''}`);
  lines.push(`    ${fromUnit.location || ''}`);
  lines.push('  TO:');
  lines.push(`    ${toUnit.name || ''}  ${toUnit.dodaac ? 'DoDAAC: ' + toUnit.dodaac : ''}`);
  lines.push(`    ${toUnit.location || toUnit.contact || ''}`);
  lines.push('─'.repeat(80));
  lines.push(`  NSN:             ${nsnFmt}`);
  lines.push(`  Description:     ${description}`);
  lines.push(`  Quantity:        ${quantity}`);
  lines.push(`  Condition:       ${condition}`);
  if (unitPrice != null) {
    lines.push(`  Unit Price:      $${parseFloat(unitPrice).toFixed(2)}`);
    lines.push(`  Total:           $${(parseFloat(unitPrice) * quantity).toFixed(2)}`);
  }
  if (jcn || mcn || buno) {
    lines.push('─'.repeat(80));
    if (buno) lines.push(`  BUNO:            ${buno}`);
    if (jcn)  lines.push(`  JCN:             ${jcn}`);
    if (mcn)  lines.push(`  MCN:             ${mcn}`);
  }
  lines.push('═'.repeat(80));

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  buildDocumentNumber,
  julianDate,
  generateA0A,
  generateAP1,
  generateAC1,
  generateDD2765,
  generateDD1348,
  generateDD1149,
};
