import { useEffect } from "react";
import type { InvoiceSheetOrder } from "../components/InvoiceSheet";

export const INVOICE_PRINT_STYLE_ID = "migoo-invoice-print-styles";
export const INVOICE_PRINT_BODY_CLASS = "invoice-print-active";

let printSessionCount = 0;

/** Injected once — shared by Invoice dialog + bulk PrintInvoice. */
export const INVOICE_PRINT_STYLES = `
@media print {
  html.invoice-print-active,
  body.invoice-print-active {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    height: auto !important;
  }

  body.invoice-print-active > :not(.invoice-print-portal) {
    display: none !important;
  }

  /* Respect the paper size chosen in the print dialog (A4, Letter, 100×150 mm, etc.) */
  @page {
    size: auto;
    margin: 0;
  }

  body.invoice-print-active .invoice-print-portal {
    display: block !important;
    position: static !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /*
   * vw scales with paper width; max(mm, vw) sets a readable floor on 100×150 mm labels
   * while keeping the US Letter proportions on larger paper.
   */
  body.invoice-print-active .invoice-page {
    width: 100% !important;
    min-height: 100vh !important;
    height: 100vh !important;
    margin: 0 !important;
    padding: max(3mm, 3.2vw) !important;
    box-sizing: border-box !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: flex-start !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    page-break-after: always !important;
    overflow: hidden !important;
    background: white !important;
    color: #000 !important;
    font-size: max(3mm, 2.05vw) !important;
    line-height: 1.5 !important;
  }

  body.invoice-print-active .invoice-page:last-child {
    page-break-after: avoid !important;
  }

  body.invoice-print-active .invoice-header {
    margin-bottom: 2.6vw !important;
    padding-bottom: 2vw !important;
  }

  body.invoice-print-active .brand-name {
    font-size: max(4.2mm, 3.92vw) !important;
    line-height: 1.15 !important;
    margin-bottom: 0.6vw !important;
  }

  body.invoice-print-active .order-date {
    font-size: max(2.9mm, 2.2vw) !important;
    margin-top: 0.4vw !important;
  }

  body.invoice-print-active .barcode-section {
    max-width: 46% !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-end !important;
    gap: 1.2vw !important;
  }

  body.invoice-print-active .barcode-section svg {
    width: 100% !important;
    max-width: 38vw !important;
    height: auto !important;
    margin-bottom: 0.4vw !important;
  }

  body.invoice-print-active .barcode-section svg text {
    font-size: max(3.6mm, 3.5vw) !important;
    font-weight: 700 !important;
    fill: #000 !important;
  }

  body.invoice-print-active .section-title {
    font-size: max(3.4mm, 2.65vw) !important;
    margin-bottom: 1.2vw !important;
    font-weight: 700 !important;
  }

  body.invoice-print-active .customer-name {
    font-size: max(3.3mm, 2.55vw) !important;
    font-weight: 600 !important;
    margin-bottom: 0.8vw !important;
  }

  body.invoice-print-active .address-line {
    font-size: max(3.1mm, 2.3vw) !important;
    margin-bottom: 0.55vw !important;
  }

  body.invoice-print-active .phone-line {
    font-size: max(3.1mm, 2.3vw) !important;
    margin-top: 0.8vw !important;
  }

  body.invoice-print-active .shipping-section {
    margin-bottom: 2.6vw !important;
    padding-bottom: 2vw !important;
  }

  body.invoice-print-active .items-table {
    margin-bottom: 2.4vw !important;
  }

  body.invoice-print-active .items-table thead th {
    font-size: max(3mm, 2.05vw) !important;
    font-weight: 700 !important;
    padding: 1.6vw 0.9vw !important;
  }

  body.invoice-print-active .items-table tbody td {
    font-size: max(3.2mm, 2.35vw) !important;
    padding: 1.8vw 0.9vw !important;
  }

  body.invoice-print-active .col-sku {
    font-size: max(2.9mm, 1.9vw) !important;
  }

  body.invoice-print-active .notes-section {
    margin: 2vw 0 !important;
    padding: 1.6vw 0 !important;
  }

  body.invoice-print-active .notes-label {
    font-size: max(3mm, 2.05vw) !important;
    font-weight: 700 !important;
    margin-bottom: 0.7vw !important;
  }

  body.invoice-print-active .notes-text {
    font-size: max(2.9mm, 1.9vw) !important;
    line-height: 1.45 !important;
  }

  body.invoice-print-active .promo-label {
    font-size: max(2.9mm, 1.9vw) !important;
  }

  body.invoice-print-active .promo-code {
    font-size: max(3.4mm, 2.65vw) !important;
  }

  body.invoice-print-active .total-section {
    margin: 2.2vw 0 !important;
    padding-top: 2vw !important;
  }

  body.invoice-print-active .subtotal-row,
  body.invoice-print-active .discount-row {
    margin-bottom: 0.8vw !important;
  }

  body.invoice-print-active .total-row {
    margin-top: 0.6vw !important;
  }

  body.invoice-print-active .subtotal-label,
  body.invoice-print-active .discount-label,
  body.invoice-print-active .subtotal-amount,
  body.invoice-print-active .discount-amount {
    font-size: max(3.3mm, 2.35vw) !important;
  }

  body.invoice-print-active .total-label,
  body.invoice-print-active .total-amount {
    font-size: max(4mm, 3.1vw) !important;
  }

  body.invoice-print-active .invoice-body {
    flex: 0 1 auto !important;
  }

  body.invoice-print-active .footer-section {
    margin-top: auto !important;
    padding-top: 2.5vw !important;
    padding-bottom: 1.2vw !important;
    flex-shrink: 0 !important;
  }

  body.invoice-print-active .thank-you {
    font-size: max(3.1mm, 2.55vw) !important;
    font-weight: 700 !important;
    color: #222 !important;
    margin: 1vw 0 0 !important;
    line-height: 1.4 !important;
  }

  body.invoice-print-active .items-table thead {
    display: table-header-group !important;
  }

  body.invoice-print-active .invoice-header,
  body.invoice-print-active .shipping-section,
  body.invoice-print-active .items-table tbody td,
  body.invoice-print-active .notes-section,
  body.invoice-print-active .footer-section {
    border: none !important;
  }

  body.invoice-print-active .items-table thead th {
    border-bottom: 1px dotted #bbb !important;
  }

  body.invoice-print-active .total-section {
    border-top: 1px dotted #bbb !important;
    border-bottom: none !important;
  }
}

@media screen {
  .invoice-print-portal {
    position: fixed;
    left: -99999px;
    top: 0;
    width: 100mm;
    opacity: 0;
    pointer-events: none;
    z-index: -9999;
  }

  .invoice-screen-preview {
    max-width: 100mm;
    margin: 0 auto;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    overflow: hidden;
  }

  .invoice-screen-preview .invoice-page {
    width: 100mm;
    padding: 5mm;
    font-size: 10px;
    line-height: 1.3;
  }

  .invoice-screen-preview .brand-name { font-size: 16px; }
  .invoice-screen-preview .order-date { font-size: 9px; }
  .invoice-screen-preview .section-title { font-size: 11px; }
  .invoice-screen-preview .customer-name { font-size: 10px; }
  .invoice-screen-preview .address-line,
  .invoice-screen-preview .phone-line { font-size: 9px; }
  .invoice-screen-preview .items-table thead th { font-size: 9px; }
  .invoice-screen-preview .items-table tbody td { font-size: 9px; }
  .invoice-screen-preview .col-sku { font-size: 8px; }
  .invoice-screen-preview .notes-label { font-size: 9px; }
  .invoice-screen-preview .notes-text { font-size: 8px; }
  .invoice-screen-preview .total-label,
  .invoice-screen-preview .total-amount { font-size: 12px; }
  .invoice-screen-preview .thank-you { font-size: 9px; }
}

.invoice-page {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  color: #000;
  background: white;
  box-sizing: border-box;
  position: relative;
}

.invoice-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.brand { flex: 1; }

.brand-name {
  font-weight: 700;
  margin: 0 0 2px 0;
  color: #000;
  letter-spacing: 0.3px;
}

.order-date {
  margin: 0;
  color: #333;
}

.barcode-section {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: 45%;
}

.barcode-section svg {
  max-width: 100%;
  height: auto;
}

.section-title {
  font-weight: 700;
  margin: 0 0 4px 0;
  color: #000;
}

.customer-name {
  margin: 0 0 2px 0;
  color: #000;
  font-weight: 600;
}

.address-line {
  margin: 0 0 1px 0;
  color: #000;
  line-height: 1.3;
}

.phone-line {
  margin: 2px 0 0 0;
  color: #000;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
}

.items-table thead th {
  font-weight: 700;
  text-align: left;
  border-bottom: 1px dotted #bbb;
  color: #000;
}

.items-table tbody td {
  vertical-align: top;
  color: #000;
  border-bottom: none;
}

.col-qty { width: 10%; text-align: center; }
.col-product { width: 40%; text-align: left; }
.col-sku { width: 25%; text-align: left; }
.col-price { width: 25%; text-align: right; }

.no-items {
  text-align: center;
  color: #999;
  padding: 10px !important;
}

.notes-section {
  padding: 4px 0;
  border-top: none;
}

.notes-label {
  font-weight: 700;
  margin: 0 0 2px 0;
  color: #000;
}

.notes-text {
  margin: 0;
  color: #333;
  white-space: pre-wrap;
}

.promo-section {
  margin: 8px 0;
  padding: 6px;
  background: #f0fdf4;
  border: none;
  border-radius: 4px;
  text-align: center;
}

.promo-label {
  font-weight: 600;
  margin: 0 0 2px 0;
  color: #16a34a;
}

.promo-code {
  font-weight: 700;
  margin: 0;
  color: #15803d;
  letter-spacing: 1px;
}

.total-section {
  border-top: 1px dotted #bbb;
}

.subtotal-row,
.discount-row,
.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.subtotal-row,
.discount-row {
  margin-bottom: 4px;
}

.subtotal-label,
.discount-label {
  font-weight: 600;
  color: #666;
}

.subtotal-amount {
  font-weight: 600;
  color: #666;
}

.discount-label { color: #16a34a; }

.discount-amount {
  font-weight: 700;
  color: #16a34a;
}

.total-label,
.total-amount {
  font-weight: 700;
  color: #000;
}

.footer-section {
  text-align: center;
}

.thank-you {
  font-weight: 400;
  margin: 0;
  color: #666;
  font-style: italic;
}
`;

export function ensureInvoicePrintStyles(): void {
  const existing = document.getElementById(INVOICE_PRINT_STYLE_ID);
  if (existing) {
    existing.textContent = INVOICE_PRINT_STYLES;
    return;
  }
  const style = document.createElement("style");
  style.id = INVOICE_PRINT_STYLE_ID;
  style.textContent = INVOICE_PRINT_STYLES;
  document.head.appendChild(style);
}

export function activateInvoicePrintSession(): void {
  printSessionCount += 1;
  ensureInvoicePrintStyles();
  document.documentElement.classList.add(INVOICE_PRINT_BODY_CLASS);
  document.body.classList.add(INVOICE_PRINT_BODY_CLASS);
}

export function deactivateInvoicePrintSession(): void {
  printSessionCount = Math.max(0, printSessionCount - 1);
  if (printSessionCount > 0) return;
  document.documentElement.classList.remove(INVOICE_PRINT_BODY_CLASS);
  document.body.classList.remove(INVOICE_PRINT_BODY_CLASS);
}

/** While active, only \`.invoice-print-portal\` nodes on \`body\` are printed. */
export function useInvoicePrintSession(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    activateInvoicePrintSession();
    return () => deactivateInvoicePrintSession();
  }, [active]);
}

/** Open the browser print dialog, then run cleanup when printing finishes or is cancelled. */
export function runBrowserPrintThen(onComplete: () => void, delayMs = 250): void {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener("afterprint", finish);
    window.clearTimeout(fallback);
    onComplete();
  };
  const fallback = window.setTimeout(finish, 5000);
  window.addEventListener("afterprint", finish);
  window.setTimeout(() => window.print(), delayMs);
}

/** Mount print payload, print, then clear via \`onComplete\`. */
export function useInvoicePrintJob(
  orders: InvoiceSheetOrder[] | null | undefined,
  onComplete: () => void
): void {
  useEffect(() => {
    if (!orders?.length) return;
    runBrowserPrintThen(onComplete);
  }, [orders, onComplete]);
}
