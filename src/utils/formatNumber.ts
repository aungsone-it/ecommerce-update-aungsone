/**
 * Format number with comma separators
 * Example: 1000000 → 1,000,000
 */
export function formatNumber(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  
  if (isNaN(num)) return '0';
  
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Format currency with comma separators (MMK)
 * Example: 1000000 → 1,000,000 MMK
 */
export function formatMMK(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '').replace('$', '')) : value;
  
  if (isNaN(num)) return '0 MMK';
  
  return `${num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} MMK`;
}

/**
 * Format currency with comma separators (USD for internal storage)
 * Example: 1000000 → $1,000,000
 */
export function formatUSD(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '').replace('$', '')) : value;
  
  if (isNaN(num)) return '$0';
  
  return `$${num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/**
 * Parse formatted number string back to number
 * Example: "1,000,000" → 1000000
 */
export function parseFormattedNumber(value: string): number {
  const num = parseFloat(value.replace(/,/g, '').replace('$', '').replace('MMK', '').trim());
  return isNaN(num) ? 0 : num;
}
