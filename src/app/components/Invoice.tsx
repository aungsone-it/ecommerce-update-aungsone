import { createPortal } from "react-dom";
import { Button } from "./ui/button";
import { Printer } from "lucide-react";
import { InvoiceSheet, type InvoiceSheetOrder } from "./InvoiceSheet";
import { useInvoicePrintSession } from "../utils/invoicePrintSession";

interface InvoiceProps {
  order: InvoiceSheetOrder;
}

export function Invoice({ order }: InvoiceProps) {
  useInvoicePrintSession(true);

  const handlePrint = () => {
    window.print();
  };

  const printPortal = (
    <div className="invoice-print-portal">
      <InvoiceSheet order={order} />
    </div>
  );

  return (
    <>
      <div className="print:hidden mb-4">
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="w-4 h-4" />
          Print Invoice
        </Button>
      </div>

      <div className="invoice-screen-preview">
        <InvoiceSheet order={order} />
      </div>

      {createPortal(printPortal, document.body)}
    </>
  );
}
