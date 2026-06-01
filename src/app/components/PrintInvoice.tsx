import { createPortal } from "react-dom";
import { InvoiceSheet, type InvoiceSheetOrder } from "./InvoiceSheet";
import { useInvoicePrintSession } from "../utils/invoicePrintSession";

interface PrintInvoiceProps {
  orders: InvoiceSheetOrder[];
}

export function PrintInvoice({ orders }: PrintInvoiceProps) {
  useInvoicePrintSession(Boolean(orders?.length));

  if (!orders || orders.length === 0) {
    console.warn("PrintInvoice: No orders provided");
    return null;
  }

  const printPortal = (
    <div className="invoice-print-portal">
      {orders.map((order, index) => (
        <InvoiceSheet key={`${order.orderNumber}-${index}`} order={order} />
      ))}
    </div>
  );

  return createPortal(printPortal, document.body);
}
