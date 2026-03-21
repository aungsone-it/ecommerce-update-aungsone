import { useRef } from "react";
import { Barcode } from "./BarcodeLazy";
import { Button } from "./ui/button";
import { Printer } from "lucide-react";

interface Product {
  id: string;
  name: string;
  quantity: number;
  price: number;
  image: string;
  sku?: string;
}

interface OrderData {
  orderNumber: string;
  date: string;
  customer: string | { fullName?: string; name?: string };
  phone: string;
  shippingAddress: string;
  products: Product[];
  total: number;
  subtotal?: number;
  discount?: number;
  couponCode?: string;
  notes?: string;
}

interface InvoiceProps {
  order: OrderData;
}

export function Invoice({ order }: InvoiceProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  // Format currency to Myanmar Kyat
  const formatCurrency = (amount: number) => {
    return `K${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Format date
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Calculate product total, subtotal, and discount with safety checks
  const productTotal = order.products && Array.isArray(order.products) 
    ? order.products.reduce((sum, item) => {
        const price = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0;
        const quantity = typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity) || 0;
        return sum + (price * quantity);
      }, 0)
    : (order.subtotal || order.total || 0);
    
  const actualDiscount = order.discount || (productTotal - (order.subtotal || order.total));
  const hasDiscount = actualDiscount > 0;
  const subtotal = productTotal; // Subtotal should be BEFORE discount
  const total = order.total || (subtotal - actualDiscount);
  
  // Calculate discount percentage
  const discountPercentage = subtotal > 0 ? Math.round((actualDiscount / subtotal) * 100) : 0;

  // Parse shipping address into lines
  const shippingLines = order.shippingAddress.split('\\n').filter(line => line.trim());

  return (
    <>
      {/* Print Button - Hidden in print mode */}
      <div className="print:hidden mb-4">
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="w-4 h-4" />
          Print Invoice
        </Button>
      </div>

      {/* Invoice Content - Optimized for 100mm x 150mm */}
      <div ref={printRef} className="invoice-container">
        <div className="invoice-page">
          {/* Header with SECURE.OS and Barcode */}
          <div className="invoice-header">
            <div className="brand">
              <h1 className="brand-name">SECURE.OS</h1>
              <p className="order-date">Date: {formatDate(order.date)}</p>
            </div>
            <div className="barcode-section">
              <Barcode 
                value={order.orderNumber.replace('#', '').replace('ORD-', 'MOS')} 
                width={1}
                height={35}
                fontSize={9}
                margin={0}
                displayValue={true}
              />
            </div>
          </div>

          {/* Shipping Information */}
          <div className="shipping-section">
            <h2 className="section-title">Shipping</h2>
            <p className="customer-name">{typeof order.customer === 'string' ? order.customer : (order.customer?.fullName || order.customer?.name || 'Guest Customer')}</p>
            {shippingLines.map((line, idx) => (
              <p key={idx} className="address-line">{line}</p>
            ))}
            {order.phone && <p className="phone-line">Tel: {order.phone}</p>}
          </div>

          {/* Items Table */}
          <table className="items-table">
            <thead>
              <tr>
                <th className="col-qty">QTY</th>
                <th className="col-product">PRODUCT</th>
                <th className="col-sku">SKU</th>
                <th className="col-price">PRICE</th>
              </tr>
            </thead>
            <tbody>
              {order.products.map((item, idx) => (
                <tr key={idx}>
                  <td className="col-qty">{item.quantity}</td>
                  <td className="col-product">{item.name}</td>
                  <td className="col-sku">{item.sku || item.id}</td>
                  <td className="col-price">{formatCurrency(item.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Notes Section */}
          {order.notes && (
            <div className="notes-section">
              <p className="notes-label">Notes:</p>
              <p className="notes-text">{order.notes}</p>
            </div>
          )}

          {/* Promo Code Section */}
          {order.couponCode && (
            <div className="promo-section">
              <p className="promo-label">🎫 Promo Code Applied:</p>
              <p className="promo-code">{order.couponCode}</p>
            </div>
          )}

          {/* Total */}
          <div className="total-section">
            {hasDiscount && (
              <>
                <div className="subtotal-row">
                  <span className="subtotal-label">Subtotal:</span>
                  <span className="subtotal-amount">{formatCurrency(subtotal)}</span>
                </div>
                <div className="discount-row">
                  <span className="discount-label">
                    Discount{order.couponCode ? ` (${order.couponCode})` : ''}:
                  </span>
                  <span className="discount-amount">
                    -{formatCurrency(actualDiscount)} ({discountPercentage}%)
                  </span>
                </div>
              </>
            )}
            <div className="total-row">
              <span className="total-label">TOTAL</span>
              <span className="total-amount">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="footer-section">
            <p className="thank-you">Thank you for ordering from us!</p>
          </div>
        </div>
      </div>

      <style>{`
        /* Print Styles - 100mm x 150mm Thermal Label */
        @media print {
          /* Hide everything except the invoice container */
          body * {
            visibility: hidden !important;
          }
          
          .invoice-container,
          .invoice-container * {
            visibility: visible !important;
          }
          
          .invoice-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Set page size to 100mm x 150mm */
          @page {
            size: 100mm 150mm;
            margin: 0;
            padding: 0;
          }

          body {
            margin: 0 !important;
            padding: 0 !important;
          }

          .invoice-page {
            width: 100mm !important;
            height: 150mm !important;
            margin: 0 !important;
            padding: 5mm !important;
            box-sizing: border-box !important;
            page-break-after: auto !important;
            page-break-inside: avoid !important;
            display: block !important;
          }
        }

        /* Screen Styles - Show preview */
        @media screen {
          .invoice-container {
            max-width: 100mm;
            margin: 0 auto;
            background: white;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            border-radius: 8px;
            overflow: hidden;
          }

          .invoice-page {
            background: white;
          }
        }

        /* Base Styles for Invoice */
        .invoice-page {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          font-size: 10px;
          line-height: 1.3;
          color: #000;
          background: white;
          padding: 5mm;
          width: 100mm;
          min-height: 150mm;
          box-sizing: border-box;
          position: relative;
        }

        /* Header */
        .invoice-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
          padding-bottom: 6px;
          border-bottom: 1px solid #ddd;
        }

        .brand {
          flex: 1;
        }

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

        /* Shipping Section */
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

        /* Items Table */
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

        .col-qty {
          width: 10%;
          text-align: center;
        }

        .col-product {
          width: 40%;
          text-align: left;
        }

        .col-sku {
          width: 25%;
          text-align: left;
          font-size: 8px;
        }

        .col-price {
          width: 25%;
          text-align: right;
        }

        /* Notes Section */
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

        /* Promo Code Section */
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

        /* Total Section */
        .total-section {
          margin: 10px 0 8px 0;
          padding-top: 6px;
          border-top: 2px solid #000;
        }

        .subtotal-row,
        .discount-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
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

        .discount-label {
          color: #16a34a;
        }

        .discount-amount {
          font-size: 10px;
          font-weight: 700;
          color: #16a34a;
        }

        /* Footer */
        .footer-section {
          margin-top: auto;
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
      `}</style>
    </>
  );
}