import { useState } from "react";
import { Plus, Search, MoreVertical, Edit, Trash2, FileText } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useLanguage } from "../contexts/LanguageContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  postCount: number;
  createdAt: string;
}

export function BlogCategory() {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");

  const [categories, setCategories] = useState<Category[]>([
    {
      id: "1",
      name: "Business Tips",
      slug: "business-tips",
      description: "Essential strategies and advice for growing your e-commerce business",
      postCount: 15,
      createdAt: "2025-12-10",
    },
    {
      id: "2",
      name: "Marketing",
      slug: "marketing",
      description: "Digital marketing strategies, campaigns, and best practices",
      postCount: 23,
      createdAt: "2025-12-10",
    },
    {
      id: "3",
      name: "Trends",
      slug: "trends",
      description: "Latest trends in e-commerce and social commerce",
      postCount: 8,
      createdAt: "2025-12-15",
    },
    {
      id: "4",
      name: "Customer Service",
      slug: "customer-service",
      description: "Tips and strategies for delivering exceptional customer service",
      postCount: 12,
      createdAt: "2025-12-18",
    },
    {
      id: "5",
      name: "Technology",
      slug: "technology",
      description: "Tech insights, tools, and platforms for online businesses",
      postCount: 6,
      createdAt: "2026-01-05",
    },
    {
      id: "6",
      name: "Product Updates",
      slug: "product-updates",
      description: "Latest features and updates from our platform",
      postCount: 4,
      createdAt: "2026-01-20",
    },
  ]);

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleNameChange = (name: string) => {
    setCategoryName(name);
    if (!editingCategory) {
      setCategorySlug(generateSlug(name));
    }
  };

  const openAddDialog = () => {
    setEditingCategory(null);
    setCategoryName("");
    setCategorySlug("");
    setCategoryDescription("");
    setShowAddDialog(true);
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategorySlug(category.slug);
    setCategoryDescription(category.description);
    setShowAddDialog(true);
  };

  const handleSave = () => {
    if (!categoryName.trim()) return;

    if (editingCategory) {
      // Edit existing category
      setCategories(categories.map(cat =>
        cat.id === editingCategory.id
          ? {
              ...cat,
              name: categoryName,
              slug: categorySlug,
              description: categoryDescription,
            }
          : cat
      ));
    } else {
      // Add new category
      const newCategory: Category = {
        id: Math.random().toString(36).substring(2, 9),
        name: categoryName,
        slug: categorySlug,
        description: categoryDescription,
        postCount: 0,
        createdAt: new Date().toISOString().split("T")[0],
      };
      setCategories([newCategory, ...categories]);
    }

    setShowAddDialog(false);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this category?")) {
      setCategories(categories.filter(cat => cat.id !== id));
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{t('blogCategory.title')}</h1>
              <p className="text-sm text-slate-500 mt-0.5">{t('blogCategory.subtitle')}</p>
            </div>
            <Button
              onClick={openAddDialog}
              className="bg-slate-900 hover:bg-slate-800 text-white"
            >
              {t('blogCategory.addCategory')}
            </Button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-6 py-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder={t('blogCategory.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
        </div>
      </div>

      {/* Categories List */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          {/* Stats */}
          <div className="mb-6 flex items-center gap-6 text-sm text-slate-600">
            <span>{filteredCategories.length} categories</span>
            <span className="h-4 w-px bg-slate-300"></span>
            <span>{categories.reduce((sum, cat) => sum + cat.postCount, 0)} total posts</span>
          </div>

          {/* Table */}
          {filteredCategories.length > 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-600 w-[250px]">{t('blogCategory.category')}</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">{t('blogCategory.slug')}</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">{t('categories.description')}</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-600 w-[120px]">{t('blogCategory.posts')}</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-600 w-[140px]">{t('blogCategory.created')}</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-600 w-12">{t('blogCategory.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.map((category) => (
                    <tr key={category.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors">
                      {/* Name */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-5 h-5 text-purple-600" />
                          </div>
                          <span className="font-medium text-sm text-slate-900">{category.name}</span>
                        </div>
                      </td>

                      {/* Slug */}
                      <td className="py-4 px-4">
                        <code className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded">
                          {category.slug}
                        </code>
                      </td>

                      {/* Description */}
                      <td className="py-4 px-4">
                        <p className="text-sm text-slate-600 line-clamp-2">
                          {category.description}
                        </p>
                      </td>

                      {/* Post Count */}
                      <td className="py-4 px-4">
                        <span className="text-sm text-slate-700 font-medium">
                          {category.postCount} {category.postCount === 1 ? "post" : "posts"}
                        </span>
                      </td>

                      {/* Created Date */}
                      <td className="py-4 px-4">
                        <span className="text-sm text-slate-600">
                          {new Date(category.createdAt).toLocaleDateString()}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="w-4 h-4 text-slate-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(category)}>
                              <Edit className="w-4 h-4 mr-2" />
                              {t('blogCategory.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(category.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              {t('blogCategory.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Empty State */
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
                <Search className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-1">No categories found</h3>
              <p className="text-sm text-slate-500">Try adjusting your search</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Edit category" : "Add new category"}
            </DialogTitle>
            <DialogDescription>
              {editingCategory
                ? "Update the category information below."
                : "Create a new blog category to organize your posts."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="categoryName" className="text-sm font-medium text-slate-900 mb-2 block">
                Category name
              </Label>
              <Input
                id="categoryName"
                placeholder="e.g., Business Tips"
                value={categoryName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="h-10"
              />
            </div>

            <div>
              <Label htmlFor="categorySlug" className="text-sm font-medium text-slate-900 mb-2 block">
                Slug
              </Label>
              <Input
                id="categorySlug"
                placeholder="e.g., business-tips"
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                className="h-10"
              />
              <p className="text-xs text-slate-500 mt-1">
                Used in URLs. Letters, numbers, and hyphens only.
              </p>
            </div>

            <div>
              <Label htmlFor="categoryDescription" className="text-sm font-medium text-slate-900 mb-2 block">
                Description
              </Label>
              <Textarea
                id="categoryDescription"
                placeholder="Brief description of this category..."
                value={categoryDescription}
                onChange={(e) => setCategoryDescription(e.target.value)}
                className="min-h-[100px] resize-y"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-slate-900 hover:bg-slate-800 text-white">
              {editingCategory ? "Save changes" : "Add category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}