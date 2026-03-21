import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  placeholder: string;
  onSearch: (query: string) => void;
  className?: string;
  inputClassName?: string;
  variant?: 'desktop' | 'mobile' | 'menu';
  value?: string;
  autoFocus?: boolean;
}

// 🎯 Isolated search input component - prevents parent re-renders from affecting input focus
export const SearchInput = React.memo(({ 
  placeholder, 
  onSearch, 
  className = '',
  inputClassName = '',
  variant = 'desktop',
  value,
  autoFocus
}: SearchInputProps) => {
  const [localValue, setLocalValue] = useState(value || '');

  // Sync local value with prop value changes
  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch(localValue);
    }
  };

  const handleClear = () => {
    setLocalValue('');
    onSearch('');
  };

  return (
    <div className={`relative ${className}`}>
      {variant !== 'mobile' && (
        <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${variant === 'desktop' ? 'left-4 w-5 h-5' : ''}`} />
      )}
      <input
        type="text"
        placeholder={placeholder}
        className={inputClassName}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
      />
      {variant === 'mobile' && !localValue && (
        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      )}
      {localValue && (
        <button
          onClick={handleClear}
          className={`absolute ${variant === 'menu' ? 'right-2.5' : variant === 'mobile' ? 'right-3.5' : 'right-4'} top-1/2 -translate-y-1/2 ${variant === 'menu' ? 'w-4 h-4' : 'w-5 h-5'} flex items-center justify-center rounded-full bg-slate-300 hover:bg-slate-400 transition-colors text-white`}
        >
          <X className={`${variant === 'menu' ? 'w-2 h-2' : 'w-3 h-3'}`} />
        </button>
      )}
    </div>
  );
});

SearchInput.displayName = 'SearchInput';