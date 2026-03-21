import { lazy, Suspense } from 'react';

// Dynamically import the barcode component to avoid build cache issues
const BarcodeLib = lazy(() => import('react-barcode'));

interface BarcodeProps {
  value: string;
  width?: number;
  height?: number;
  fontSize?: number;
  margin?: number;
  displayValue?: boolean;
}

export function Barcode({ value, width = 2, height = 50, fontSize = 14, margin = 10, displayValue = true }: BarcodeProps) {
  return (
    <Suspense fallback={<div className="h-16 bg-gray-100 animate-pulse rounded"></div>}>
      <BarcodeLib 
        value={value}
        width={width}
        height={height}
        fontSize={fontSize}
        margin={margin}
        displayValue={displayValue}
      />
    </Suspense>
  );
}
