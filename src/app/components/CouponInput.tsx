import React, { useState } from 'react';
import { Button } from './ui/button';

interface CouponInputProps {
  onApply: (code: string) => void;
  loading: boolean;
  error: string;
  onErrorClear: () => void;
  variant?: 'cart' | 'checkout';
}

// 🎯 Isolated coupon input component - prevents parent re-renders from affecting input focus
export const CouponInput = React.memo(({ 
  onApply, 
  loading, 
  error,
  onErrorClear,
  variant = 'cart'
}: CouponInputProps) => {
  const [localValue, setLocalValue] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value.toUpperCase());
    if (error) onErrorClear();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // 🔧 Prevent page refresh
      onApply(localValue);
    }
  };

  const handleApply = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault(); // 🔧 ALWAYS prevent default
    e.stopPropagation(); // 🔧 STOP event bubbling
    onApply(localValue);
  };

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Enter coupon code"
        className={`flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent uppercase`}
        disabled={loading}
        autoComplete="off"
      />
      <Button
        type="button"
        onClick={handleApply}
        disabled={loading || !localValue.trim()}
        className="bg-[#1a1d29] hover:bg-slate-900 text-sm font-medium text-white px-4 h-11"
        size="sm"
      >
        {loading ? 'Applying...' : 'Apply'}
      </Button>
    </div>
  );
});

CouponInput.displayName = 'CouponInput';