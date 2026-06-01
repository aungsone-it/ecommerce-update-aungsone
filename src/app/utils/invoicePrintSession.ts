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

  /* Respect the paper size chosen in the print dialog (A4, Letter, etc.) */
  @page {
    margin: 0;
  }

  body.invoice-print-active .invoice-print-portal {
    display: block !important;
    position: static !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  body.invoice-print-active .invoice-page {
    width: 100% !important;
    min-height: 100vh !important;
    height: 100vh !important;
    margin: 0 !important;
    padding: 12mm !important;
    box-sizing: border-box !important;
    display: flex !important;
    flex-direction: column !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    page-break-after: always !important;
    overflow: hidden !important;
    background: white !important;
    color: #000 !important;
    font-size: 14px !important;
    line-height: 1.4 !important;
  }

  body.invoice-print-active .invoice-page:last-child {
    page-break-after: avoid !important;
  }

  body.invoice-print-active .invoice-header {
    margin-bottom: 16px !important;
    padding-bottom: 12px !important;
  }

  body.invoice-print-active .brand-name {
    font-size: 32px !important;
  }

  body.invoice-print-active .order-date {
    font-size: 16px !important;
  }

  body.invoice-print-active .barcode-section {
    max-width: 50% !important;
  }

  body.invoice-print-active .barcode-section svg {
    width: 100% !important;
    max-width: 320px !important;
    height: auto !important;
  }

  body.invoice-print-active .section-title {
    font-size: 18px !important;
    margin-bottom: 8px !important;
  }

  body.invoice-print-active .customer-name {
    font-size: 16px !important;
  }

  body.invoice-print-active .address-line,
  body.invoice-print-active .phone-line {
    font-size: 14px !important;
  }

  body.invoice-print-active .shipping-section {
    margin-bottom: 20px !important;
    padding-bottom: 12px !important;
  }

  body.invoice-print-active .items-table {
    margin-bottom: 20px !important;
    flex: 1 1 auto !important;
  }

  body.invoice-print-active .items-table thead th {
    font-size: 14px !important;
    padding: 10px 6px !important;
  }

  body.invoice-print-active .items-table tbody td {
    font-size: 14px !important;
    padding: 12px 6px !important;
  }

  body.invoice-print-active .col-sku {
    font-size: 13px !important;
  }

  body.invoice-print-active .notes-label {
    font-size: 14px !important;
  }

  body.invoice-print-active .notes-text {
    font-size: 13px !important;
  }

  body.invoice-print-active .promo-label {
    font-size: 13px !important;
  }

  body.invoice-print-active .promo-code {
    font-size: 18px !important;
  }

  body.invoice-print-active .total-section {
    margin: 16px 0 !important;
    padding-top: 12px !important;
  }

  body.invoice-print-active .subtotal-label,
  body.invoice-print-active .discount-label,
  body.invoice-print-active .subtotal-amount,
  body.invoice-print-active .discount-amount {
    font-size: 16px !important;
  }

  body.invoice-print-active .total-label,
  body.invoice-print-active .total-amount {
    font-size: 22px !important;
  }

  body.invoice-print-active .footer-section {
    margin-top: auto !important;
    padding-top: 16px !important;
  }

  body.invoice-print-active .thank-you {
    font-size: 14px !important;
  }

  body.invoice-print-active .items-table thead {
    display: table-header-group !important;
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
  border-bottom: 1px solid #ddd;
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

.shipping-section {
  border-bottom: 1px solid #ddd;
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
  border-bottom: 1px solid #000;
  color: #000;
}

.items-table tbody td {
  vertical-align: top;
  color: #000;
  border-bottom: 1px solid #eee;
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
  border-top: 1px dashed #ccc;
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
  border: 1px dashed #22c55e;
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
  border-top: 2px solid #000;
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
  border-top: 1px solid #ddd;
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
