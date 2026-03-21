// ============================================
// CUSTOM HOOKS FOR API CALLS
// ============================================

import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

interface UseApiOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  successMessage?: string;
}

/**
 * Generic hook for API calls with loading and error states
 */
export function useApi<T = any>(options: UseApiOptions = {}) {
  const {
    onSuccess,
    onError,
    showSuccessToast = false,
    showErrorToast = true,
    successMessage,
  } = options;

  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (apiCall: () => Promise<T>) => {
      setState({ data: null, loading: true, error: null });

      try {
        const result = await apiCall();
        setState({ data: result, loading: false, error: null });

        if (showSuccessToast && successMessage) {
          toast.success(successMessage);
        }

        if (onSuccess) {
          onSuccess(result);
        }

        return result;
      } catch (error) {
        const err = error as Error;
        setState({ data: null, loading: false, error: err });

        if (showErrorToast) {
          toast.error(err.message || 'An error occurred');
        }

        if (onError) {
          onError(err);
        }

        throw error;
      }
    },
    [onSuccess, onError, showSuccessToast, showErrorToast, successMessage]
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}

/**
 * Hook for managing paginated data
 */
export function usePagination<T>(
  items: T[],
  pageSize: number = 20
) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(items.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentItems = items.slice(startIndex, endIndex);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  const reset = useCallback(() => {
    setCurrentPage(1);
  }, []);

  return {
    currentPage,
    totalPages,
    currentItems,
    goToPage,
    nextPage,
    prevPage,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
    reset,
  };
}

/**
 * Hook for managing selection (multi-select)
 */
export function useSelection<T extends { id: string }>(initialSelected: string[] = []) {
  const [selected, setSelected] = useState<string[]>(initialSelected);

  const toggleSelection = useCallback((id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const toggleAll = useCallback((items: T[]) => {
    setSelected(prev =>
      prev.length === items.length ? [] : items.map(item => item.id)
    );
  }, []);

  const clearSelection = useCallback(() => {
    setSelected([]);
  }, []);

  const isSelected = useCallback(
    (id: string) => selected.includes(id),
    [selected]
  );

  const isAllSelected = useCallback(
    (items: T[]) => items.length > 0 && selected.length === items.length,
    [selected]
  );

  const isSomeSelected = useCallback(
    (items: T[]) => selected.length > 0 && selected.length < items.length,
    [selected]
  );

  return {
    selected,
    toggleSelection,
    toggleAll,
    clearSelection,
    isSelected,
    isAllSelected,
    isSomeSelected,
    selectedCount: selected.length,
  };
}
