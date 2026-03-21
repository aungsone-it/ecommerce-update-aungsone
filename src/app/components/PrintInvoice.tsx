import { Barcode } from "./BarcodeLazy";

interface OrderItem {
  id: string;
  orderNumber: string;
  date: string;
  customer: string;
  email: string;
  vendor: string;
  total: number;
  items?: any[];
  products?: any[];  // Support both items and products
  status: string;
  paymentStatus: string;
  shippingStatus: string;
  shippingAddress?: string;
  phone?: string;
  notes?: string;
}

interface PrintInvoiceProps {
  orders: OrderItem[];
}

export function PrintInvoice({ orders }: PrintInvoiceProps) {
  // Safety check - ensure we have valid orders
  if (!orders || orders.length === 0) {
    console.warn('PrintInvoice: No orders provided');
    return null;
  }

  return (
    <>
      <div className="print-container">
        {orders.map((order, index) => {
          try {
            // Get items from order - support both 'items' and 'products' fields
            const items = order.products || order.items || [];
            const subtotal = items.reduce((sum: number, item: any) => {
              const price = typeof item.price === 'string' ? parseFloat(item.price.replace(/[^0-9.-]+/g, '')) : (item.price || 0);
              return sum + (price * (item.quantity || 1));
            }, 0);
            const total = order.total || subtotal;

            // Parse shipping address
            const shippingLines = (order.shippingAddress || 'No address provided').split('\n').filter(line => line.trim());
            const phone = order.phone || '';

            return (
              <div 
                key={order.id} 
                className="invoice-page"
                data-order-index={index}
              >
                {/* Header with SECURE.OS and Barcode */}
                <div className="invoice-header">
                  <div className="brand">
                    <h1 className="brand-name">SECURE.OS</h1>
                    <p className="order-date">Date: {new Date(order.date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</p>
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
                  {phone && <p className="phone-line">Tel: {phone}</p>}
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
                    {items.length > 0 ? (
                      items.map((item: any, idx: number) => {
                        const price = typeof item.price === 'string' 
                          ? parseFloat(item.price.replace(/[^0-9.-]+/g, '')) 
                          : (item.price || 0);
                        
                        return (
                          <tr key={idx}>
                            <td className="col-qty">{item.quantity || 1}</td>
                            <td className="col-product">{item.name || item.title || 'Product'}</td>
                            <td className="col-sku">{item.sku || item.id || '-'}</td>
                            <td className="col-price">K{price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="no-items">No items</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Notes Section */}
                {order.notes && (
                  <div className="notes-section">
                    <p className="notes-label">Notes:</p>
                    <p className="notes-text">{order.notes}</p>
                  </div>
                )}

                {/* Total */}
                <div className="total-section">
                  <div className="total-row">
                    <span className="total-label">TOTAL</span>
                    <span className="total-amount">K{(typeof total === 'string' ? parseFloat(total.replace(/[^0-9.-]+/g, '')) : total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="footer-section">
                  <p className="thank-you">Thank you for ordering from us!</p>
                </div>
              </div>
            );
          } catch (error) {
            console.error(`Error processing order ${order.id}:`, error);
            return null;
          }
        })}
      </div>

      <style>{`
        /* Print Styles - 100mm x 150mm Thermal Label */
        @media print {
          /* Hide everything except the print container */
          body * {
            visibility: hidden !important;
          }
          
          .print-container,
          .print-container * {
            visibility: visible !important;
          }
          
          .print-container {
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
            page-break-after: always !important;
            page-break-inside: avoid !important;
            display: block !important;
          }

          .invoice-page:last-child {
            page-break-after: auto !important;
          }
        }

        /* Screen Styles - Hide from view but keep in DOM */
        @media screen {
          .print-container {
            position: fixed;
            left: -99999px;
            top: 0;
            width: 100mm;
            opacity: 0;
            pointer-events: none;
            z-index: -9999;
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

        .no-items {
          text-align: center;
          color: #999;
          padding: 10px !important;
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

        /* Total Section */
        .total-section {
          margin: 10px 0 8px 0;
          padding-top: 6px;
          border-top: 2px solid #000;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .total-label {
          font-size: 12px;
          font-weight: 700;
          color: #000;
        }

        .total-amount {
          font-size: 12px;
          font-weight: 700;
          color: #000;
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