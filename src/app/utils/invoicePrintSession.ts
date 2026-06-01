import { useEffect } from "react";

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
    width: 100mm !important;
    height: auto !important;
  }

  body.invoice-print-active > :not(.invoice-print-portal) {
    display: none !important;
  }

  @page {
    size: 100mm 150mm;
    margin: 0;
  }

  body.invoice-print-active .invoice-print-portal {
    display: block !important;
    position: static !important;
    left: auto !important;
    top: auto !important;
    width: 100mm !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  body.invoice-print-active .invoice-page {
    width: 100mm !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 5mm !important;
    box-sizing: border-box !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    page-break-after: always !important;
    overflow: visible !important;
    background: white !important;
    color: #000 !important;
  }

  body.invoice-print-active .invoice-page:last-child {
    page-break-after: avoid !important;
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
}

.invoice-page {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 10px;
  line-height: 1.3;
  color: #000;
  background: white;
  padding: 5mm;
  width: 100mm;
  box-sizing: border-box;
  position: relative;
}

.invoice-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #ddd;
}

.brand { flex: 1; }

.brand-name {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 2px 0;
  color: #000;
  letter-spacing: 0.3px;
}

.order-date {
  font-size: 9px;
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
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid #ddd;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  margin: 0 0 4px 0;
  color: #000;
}

.customer-name {
  font-size: 10px;
  margin: 0 0 2px 0;
  color: #000;
  font-weight: 600;
}

.address-line {
  font-size: 9px;
  margin: 0 0 1px 0;
  color: #000;
  line-height: 1.3;
}

.phone-line {
  font-size: 9px;
  margin: 2px 0 0 0;
  color: #000;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 10px;
}

.items-table thead th {
  font-size: 9px;
  font-weight: 700;
  text-align: left;
  padding: 4px 2px;
  border-bottom: 1px solid #000;
  color: #000;
}

.items-table tbody td {
  font-size: 9px;
  padding: 5px 2px;
  vertical-align: top;
  color: #000;
  border-bottom: 1px solid #eee;
}

.col-qty { width: 10%; text-align: center; }
.col-product { width: 40%; text-align: left; }
.col-sku { width: 25%; text-align: left; font-size: 8px; }
.col-price { width: 25%; text-align: right; }

.no-items {
  text-align: center;
  color: #999;
  padding: 10px !important;
}

.notes-section {
  margin: 8px 0;
  padding: 4px 0;
  border-top: 1px dashed #ccc;
}

.notes-label {
  font-size: 9px;
  font-weight: 700;
  margin: 0 0 2px 0;
  color: #000;
}

.notes-text {
  font-size: 8px;
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
  font-size: 8px;
  font-weight: 600;
  margin: 0 0 2px 0;
  color: #16a34a;
}

.promo-code {
  font-size: 11px;
  font-weight: 700;
  margin: 0;
  color: #15803d;
  letter-spacing: 1px;
}

.total-section {
  margin: 10px 0 8px 0;
  padding-top: 6px;
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
  font-size: 10px;
  font-weight: 600;
  color: #666;
}

.subtotal-amount {
  font-size: 10px;
  font-weight: 600;
  color: #666;
}

.discount-label { color: #16a34a; }

.discount-amount {
  font-size: 10px;
  font-weight: 700;
  color: #16a34a;
}

.total-label,
.total-amount {
  font-size: 12px;
  font-weight: 700;
  color: #000;
}

.footer-section {
  text-align: center;
  padding-top: 8px;
  border-top: 1px solid #ddd;
}

.thank-you {
  font-size: 9px;
  font-weight: 400;
  margin: 0;
  color: #666;
  font-style: italic;
}
`;

export function ensureInvoicePrintStyles(): void {
  if (document.getElementById(INVOICE_PRINT_STYLE_ID)) return;
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
