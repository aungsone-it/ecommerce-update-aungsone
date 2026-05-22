import { useState, useEffect, useCallback } from "react";
import { Plus, Edit, Trash2, Folder } from "lucide-react";
import { AdminClearableSearchInput } from "./AdminClearableSearchInput";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogTitle 
} from "./ui/alert-dialog";
import { CheckCircle2, XCircle, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { categoriesApi } from "../../utils/api";
import { CategoryForm } from "./CategoryForm";
import { useLanguage } from "../contexts/LanguageContext";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { cacheManager } from "../utils/cacheManager";
import {
  getCachedAdminAllCategories,
  primeAdminAllCategoriesCache,
  invalidateAdminAllCategoriesCache,
  removeAdminCategoriesFromCaches,
  addPendingAdminCategoryDeletes,
  clearPendingAdminCategoryDeletes,
  filterOutPendingAdminCategoryDeletes,
  getPendingAdminCategoryDeleteIds,
  suppressAdminCategoriesRealtimeReload,
  shouldSuppressAdminCategoriesRealtimeReload,
  resolveCategoryProductCount,
  moduleCache,
  CACHE_KEYS as MODULE_CACHE_KEYS,
} from "../utils/module-cache";

interface Category {
  id: string;
  name: string;
  description: string;
  image?: string;
  coverPhoto?: string;
  productCount: number;
  productIds: string[];
  status: "active" | "hide";
  createdAt?: string;
  updatedAt?: string;
  vendorId?: string;
  vendorName?: string;
}

export function Categories() {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  
  const [categories, setCategories] = useState<Category[]>(() => {
    const peeked = moduleCache.peek<Category[]>(MODULE_CACHE_KEYS.ADMIN_ALL_CATEGORIES);
    if (peeked != null && Array.isArray(peeked)) {
      return filterOutPendingAdminCategoryDeletes(peeked);
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState(
    () => !moduleCache.peek(MODULE_CACHE_KEYS.ADMIN_ALL_CATEGORIES)
  );
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // 🎯 Alert Modal State
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    description: string;
    type: "success" | "error" | "warning" | "info";
    action?: () => void;
  }>({
    title: "",
    description: "",
    type: "info",
  });

  const applyOptimisticCategoryRemoval = useCallback(
    (idsToRemove: string[], sourceList: Category[]) => {
      const idSet = new Set(idsToRemove.map(String).filter(Boolean));
      if (idSet.size === 0) return sourceList;
      const next = sourceList.filter((cat) => !idSet.has(cat.id));
      setCategories(next);
      primeAdminAllCategoriesCache(next);
      cacheManager.set("categories", next);
      removeAdminCategoriesFromCaches([...idSet]);
      addPendingAdminCategoryDeletes([...idSet]);
      suppressAdminCategoriesRealtimeReload();
      return next;
    },
    []
  );

  const deleteCategoryOnServer = async (id: string): Promise<void> => {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/categories/${id}`,
      {
        method: "DELETE",
        keepalive: true,
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
        },
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || "Failed to delete category");
    }
  };

  const resumePendingCategoryDeletes = useCallback(async () => {
    const pending = getPendingAdminCategoryDeleteIds();
    if (pending.length === 0) return;

    await Promise.allSettled(
      pending.map(async (id) => {
        try {
          await deleteCategoryOnServer(id);
          clearPendingAdminCategoryDeletes([id]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes("not found") || message.includes("404")) {
            clearPendingAdminCategoryDeletes([id]);
          }
        }
      })
    );
  }, []);

  const loadCategories = useCallback(async (forceRefresh = false, opts?: { silent?: boolean }) => {
    let showLoadingTimer: ReturnType<typeof setTimeout> | null = null;
    if (!opts?.silent) {
      showLoadingTimer = setTimeout(() => {
        setIsLoading(true);
      }, 300);
    }

    if (!forceRefresh) {
      const peeked = moduleCache.peek<Category[]>(MODULE_CACHE_KEYS.ADMIN_ALL_CATEGORIES);
      if (peeked != null && Array.isArray(peeked)) {
        const filtered = filterOutPendingAdminCategoryDeletes(peeked);
        setCategories(filtered);
        cacheManager.set("categories", filtered);
        if (showLoadingTimer) clearTimeout(showLoadingTimer);
        setIsLoading(false);
        return;
      }
    }

    try {
      const list = await getCachedAdminAllCategories(forceRefresh);
      const filtered = filterOutPendingAdminCategoryDeletes(list);
      setCategories(filtered);
      cacheManager.set("categories", filtered);
    } catch (error: unknown) {
      console.error("Failed to load categories:", error);
      if (!opts?.silent) {
        setCategories([]);
      }
    } finally {
      if (showLoadingTimer) {
        clearTimeout(showLoadingTimer);
      }
      setIsLoading(false);
    }
  }, []);

  // Load categories from database + finish any in-flight deletes (e.g. after hard refresh)
  useEffect(() => {
    void loadCategories();
    void resumePendingCategoryDeletes();

    const handleVendorUpdate = () => {
      void loadCategories(true, { silent: true });
    };
    const handleCategoryRealtime = () => {
      if (shouldSuppressAdminCategoriesRealtimeReload()) {
        return;
      }
      void loadCategories(true, { silent: true });
    };

    window.addEventListener("vendorDataUpdated", handleVendorUpdate as EventListener);
    window.addEventListener("categoryDataUpdated", handleCategoryRealtime as EventListener);

    const clearCache = () => {
      if (shouldSuppressAdminCategoriesRealtimeReload()) {
        return;
      }
      invalidateAdminAllCategoriesCache();
      void loadCategories(true, { silent: true });
    };

    cacheManager.registerInvalidation("categories", clearCache);

    return () => {
      window.removeEventListener("vendorDataUpdated", handleVendorUpdate as EventListener);
      window.removeEventListener("categoryDataUpdated", handleCategoryRealtime as EventListener);
    };
  }, [loadCategories, resumePendingCategoryDeletes]);

  const filteredCategories = categories.filter(category =>
    category.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    category.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleCategorySelection = (categoryId: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryId) ? prev.filter(id => id !== categoryId) : [...prev, categoryId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedCategories.length === filteredCategories.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(filteredCategories.map(cat => cat.id));
    }
  };

  const handleBulkDelete = async () => {
    showAlert(
      "Delete Categories?",
      `${selectedCategories.length} ${selectedCategories.length === 1 ? 'category' : 'categories'} will be permanently deleted.`,
      "warning",
      async () => {
        const previousCategories = [...categories];
        const idsToDelete = [...selectedCategories];

        applyOptimisticCategoryRemoval(idsToDelete, previousCategories);
        setSelectedCategories([]);
        setAlertOpen(false);

        try {
          const results = await Promise.allSettled(
            idsToDelete.map((categoryId) => deleteCategoryOnServer(categoryId))
          );
          const failedIds = idsToDelete.filter(
            (_, index) => results[index].status === "rejected"
          );
          const succeededIds = idsToDelete.filter(
            (_, index) => results[index].status === "fulfilled"
          );
          clearPendingAdminCategoryDeletes(succeededIds);

          if (failedIds.length > 0) {
            clearPendingAdminCategoryDeletes(failedIds);
            const failedRows = previousCategories.filter((cat) =>
              failedIds.includes(cat.id)
            );
            setCategories((prev) => {
              const merged = [...prev];
              for (const row of failedRows) {
                if (!merged.some((c) => c.id === row.id)) merged.push(row);
              }
              return merged;
            });
            setSelectedCategories(failedIds);
            const next =
              succeededIds.length > 0
                ? previousCategories.filter((cat) => !succeededIds.includes(cat.id))
                : previousCategories;
            primeAdminAllCategoriesCache(next);
            cacheManager.set("categories", next);
            const successCount = succeededIds.length;
            showAlert(
              successCount > 0 ? "Partial Delete" : "Failed to Delete Categories",
              successCount > 0
                ? `${successCount} categor${successCount === 1 ? "y" : "ies"} deleted. ${failedIds.length} could not be removed.`
                : "An error occurred. Please try again.",
              successCount > 0 ? "warning" : "error"
            );
            return;
          }

          toast.success(
            `${idsToDelete.length} ${idsToDelete.length === 1 ? "category" : "categories"} deleted`
          );
        } catch (error) {
          clearPendingAdminCategoryDeletes(idsToDelete);
          console.error("Failed to delete categories:", error);
          setCategories(previousCategories);
          setSelectedCategories(idsToDelete);
          primeAdminAllCategoriesCache(previousCategories);
          cacheManager.set("categories", previousCategories);
          showAlert(
            "Failed to Delete Categories",
            "An error occurred. Please try again.",
            "error"
          );
        }
      }
    );
  };

  const handleBulkStatusChange = async (status: "active" | "hide") => {
    // Optimistic update: update status immediately
    const previousCategories = [...categories];
    const previousSelected = [...selectedCategories];
    
    setCategories(categories.map(cat => 
      selectedCategories.includes(cat.id) ? { ...cat, status } : cat
    ));
    setSelectedCategories([]);

    try {
      await Promise.all(
        selectedCategories.map(id => categoriesApi.update(id, { status }))
      );
      console.log(`✅ Updated ${previousSelected.length} categories to ${status}`);
      const next = previousCategories.map((cat) =>
        previousSelected.includes(cat.id) ? { ...cat, status } : cat
      );
      primeAdminAllCategoriesCache(next);
      cacheManager.set("categories", next);
      showAlert(
        "Status Updated Successfully!",
        `${previousSelected.length} ${previousSelected.length === 1 ? 'category' : 'categories'} ${previousSelected.length === 1 ? 'has' : 'have'} been set to ${status === "active" ? "Active" : "Hidden"}`,
        "success"
      );
    } catch (error) {
      // Revert on error
      console.error("Failed to update category status:", error);
      setCategories(previousCategories);
      setSelectedCategories(previousSelected);
      primeAdminAllCategoriesCache(previousCategories);
      cacheManager.set("categories", previousCategories);
      showAlert(
        "Failed to Update Status",
        "An error occurred while updating category status. Please try again.",
        "error"
      );
    }
  };

  const handleDeleteCategory = async (id: string) => {
    showAlert(
      "Delete This Category?",
      "This action cannot be undone. Products in this category will not be affected.",
      "warning",
      async () => {
        const previousCategories = [...categories];
        applyOptimisticCategoryRemoval([id], previousCategories);
        setAlertOpen(false);

        try {
          await deleteCategoryOnServer(id);
          clearPendingAdminCategoryDeletes([id]);
          toast.success("Category deleted");
        } catch (error) {
          clearPendingAdminCategoryDeletes([id]);
          console.error("Failed to delete category:", error);
          setCategories(previousCategories);
          primeAdminAllCategoriesCache(previousCategories);
          cacheManager.set("categories", previousCategories);
          showAlert(
            "Failed to Delete Category",
            "An error occurred. Please try again.",
            "error"
          );
        }
      }
    );
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setShowForm(true);
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    setShowForm(true);
  };

  const handleFormBack = () => {
    setShowForm(false);
    setEditingCategory(null);
  };

  const handleFormSave = () => {
    setShowForm(false);
    setEditingCategory(null);
    invalidateAdminAllCategoriesCache();
    void loadCategories(true, { silent: true });
  };

  // 🎯 Alert Modal Helper Functions
  const showAlert = (
    title: string,
    description: string,
    type: "success" | "error" | "warning" | "info",
    action?: () => void
  ) => {
    setAlertConfig({ title, description, type, action });
    setAlertOpen(true);
  };

  // 🎨 Get icon based on alert type
  const getAlertIcon = () => {
    switch (alertConfig.type) {
      case "success":
        return (
          <svg className="w-16 h-16" viewBox="0 0 24 24" fill="none">
            <circle 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="2" 
              className="text-green-600"
              style={{
                strokeDasharray: 63,
                strokeDashoffset: 63,
                animation: 'drawCircle 0.6s ease-out forwards'
              }}
            />
            <path 
              d="M8 12.5l2.5 2.5L16 9" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className="text-green-600"
              style={{
                strokeDasharray: 12,
                strokeDashoffset: 12,
                animation: 'drawCheck 0.4s ease-out 0.6s forwards'
              }}
            />
          </svg>
        );
      case "error":
        return (
          <svg className="w-16 h-16" viewBox="0 0 24 24" fill="none">
            <circle 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="2" 
              className="text-red-600"
              style={{
                strokeDasharray: 63,
                strokeDashoffset: 63,
                animation: 'drawCircle 0.6s ease-out forwards'
              }}
            />
            <path 
              d="M15 9l-6 6M9 9l6 6" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round"
              className="text-red-600"
              style={{
                strokeDasharray: 17,
                strokeDashoffset: 17,
                animation: 'drawX 0.4s ease-out 0.6s forwards'
              }}
            />
          </svg>
        );
      case "warning":
        return (
          <svg className="w-16 h-16" viewBox="0 0 24 24" fill="none">
            <circle 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="2" 
              className="text-orange-600"
              style={{
                strokeDasharray: 63,
                strokeDashoffset: 63,
                animation: 'drawCircle 0.6s ease-out forwards'
              }}
            />
            <path 
              d="M12 8v4M12 16h.01" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round"
              className="text-orange-600"
              style={{
                strokeDasharray: 8,
                strokeDashoffset: 8,
                animation: 'drawAlert 0.4s ease-out 0.6s forwards'
              }}
            />
          </svg>
        );
      case "info":
        return (
          <svg className="w-16 h-16" viewBox="0 0 24 24" fill="none">
            <circle 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="2" 
              className="text-blue-600"
              style={{
                strokeDasharray: 63,
                strokeDashoffset: 63,
                animation: 'drawCircle 0.6s ease-out forwards'
              }}
            />
            <path 
              d="M12 11v5M12 8h.01" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round"
              className="text-blue-600"
              style={{
                strokeDasharray: 8,
                strokeDashoffset: 8,
                animation: 'drawAlert 0.4s ease-out 0.6s forwards'
              }}
            />
          </svg>
        );
    }
  };

  // 🎨 Get background color based on alert type
  const getAlertBg = () => {
    return "bg-white"; // Always white background
  };

  // Show form page
  if (showForm) {
    return <CategoryForm onBack={handleFormBack} onSave={handleFormSave} editingCategory={editingCategory} />;
  }

  // Show list page
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t('categories.title')}</h1>
      </div>

      {/* Toolbar */}
      <Card className="mb-4">
        <div className="p-4 flex items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <AdminClearableSearchInput
              placeholder={t('categories.searchPlaceholder')}
              className="border-slate-300"
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button 
              className="bg-slate-900 hover:bg-slate-800 text-white"
              onClick={handleAddCategory}
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('categories.addCategory')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Bulk Actions Bar */}
      {selectedCategories.length > 0 && (
        <Card className="mb-4 bg-slate-900 text-white border-slate-900">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">
                {selectedCategories.length} {selectedCategories.length === 1 ? 'category' : 'categories'} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-slate-800 hover:text-white"
                onClick={() => setSelectedCategories([])}
              >
                Clear selection
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Select onValueChange={handleBulkStatusChange}>
                <SelectTrigger className="w-[180px] bg-white text-slate-900 border-white">
                  <SelectValue placeholder="Change status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Set to Active</SelectItem>
                  <SelectItem value="hide">Set to Hidden</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Categories Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="w-12 py-3 px-6">
                  <Checkbox
                    checked={selectedCategories.length === filteredCategories.length && filteredCategories.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="text-left py-3 px-6 text-sm font-medium text-slate-600">
                  Category
                </th>
                <th className="text-left py-3 px-6 text-sm font-medium text-slate-600">
                  Description
                </th>
                <th className="text-left py-3 px-6 text-sm font-medium text-slate-600">
                  Products
                </th>
                <th className="text-left py-3 px-6 text-sm font-medium text-slate-600">
                  Status
                </th>
                <th className="text-right py-3 px-6 text-sm font-medium text-slate-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                // Loading skeleton rows
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className="animate-pulse">
                    <td className="py-4 px-6">
                      <div className="w-4 h-4 bg-slate-200 rounded"></div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-200 rounded-lg"></div>
                        <div className="h-4 bg-slate-200 rounded w-32"></div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="h-4 bg-slate-200 rounded w-40"></div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="h-4 bg-slate-200 rounded w-16"></div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="h-6 bg-slate-200 rounded-full w-16"></div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 bg-slate-200 rounded"></div>
                        <div className="h-8 w-8 bg-slate-200 rounded"></div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : filteredCategories.length > 0 ? (
                filteredCategories.map((category) => (
                  <tr 
                    key={category.id} 
                    className={`transition-colors ${ 
                      selectedCategories.includes(category.id) 
                        ? 'bg-blue-50 hover:bg-blue-100' 
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-4 px-6">
                      <Checkbox
                        checked={selectedCategories.includes(category.id)}
                        onCheckedChange={() => toggleCategorySelection(category.id)}
                      />
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        {(category.image || category.coverPhoto) ? (
                          <img
                            src={`${category.image || category.coverPhoto}?t=${category.updatedAt || category.createdAt || Date.now()}`}
                            alt={category.name}
                            className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                            onError={(e) => {
                              // Hide broken image and show folder icon fallback
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div 
                          className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center"
                          style={{ display: (category.image || category.coverPhoto) ? 'none' : 'flex' }}
                        >
                          <Folder className="w-5 h-5 text-slate-400" />
                        </div>
                        <span className="text-sm font-medium text-slate-900">{category.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <p className="text-sm text-slate-600 max-w-xs truncate">
                        {category.description}
                      </p>
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-sm text-slate-900">
                        {resolveCategoryProductCount(category)}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <Badge 
                        variant="secondary"
                        className={
                          category.status === "active"
                            ? "bg-green-50 text-green-700 hover:bg-green-50 border border-green-200"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-100 border border-slate-200"
                        }
                      >
                        {category.status === "active" ? "Active" : "Hidden"}
                      </Badge>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-slate-600 hover:text-slate-900"
                          onClick={() => handleEditCategory(category)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-slate-600 hover:text-red-600"
                          onClick={() => handleDeleteCategory(category.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : null}
            </tbody>
          </table>
        </div>

        {!isLoading && filteredCategories.length === 0 && (
          <div className="p-12 text-center">
            <Folder className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-base font-medium text-slate-900 mb-2">No categories found</h3>
            <p className="text-sm text-slate-500 mb-4">Get started by creating a new category</p>
            <Button 
              className="bg-slate-900 hover:bg-slate-800"
              onClick={handleAddCategory}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add category
            </Button>
          </div>
        )}
      </Card>

      {/* Alert Modal */}
      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent className="bg-white text-center w-[300px] h-[300px] p-0 rounded-2xl">
          {/* Content - Perfectly Centered in Square */}
          <div className="flex flex-col items-center justify-center text-center h-full px-6">
            {/* Icon */}
            <div className="mb-3">
              {getAlertIcon()}
            </div>

            {/* Title & Description - COMPACT */}
            {alertConfig.title && (
              <AlertDialogTitle className="text-lg font-bold text-slate-900 mb-1 leading-tight">
                {alertConfig.title}
              </AlertDialogTitle>
            )}
            <AlertDialogDescription className="text-sm text-slate-600 leading-snug mb-5">
              {alertConfig.description}
            </AlertDialogDescription>

            {/* Button */}
            {alertConfig.action && (
              <AlertDialogFooter>
                <AlertDialogAction
                  className="bg-blue-500 text-white hover:bg-blue-600 px-10"
                  onClick={alertConfig.action}
                >
                  Confirm
                </AlertDialogAction>
              </AlertDialogFooter>
            )}
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* 🎯 SVG DRAWING ANIMATIONS */}
      <style>{`
        @keyframes drawCircle {
          to {
            stroke-dashoffset: 0;
          }
        }
        
        @keyframes drawCheck {
          to {
            stroke-dashoffset: 0;
          }
        }
        
        @keyframes drawX {
          to {
            stroke-dashoffset: 0;
          }
        }
        
        @keyframes drawAlert {
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}