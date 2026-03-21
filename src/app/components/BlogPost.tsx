import { useState, useEffect } from "react";
import { Plus, Search, MoreVertical, Eye, MessageCircle, Heart, Calendar, Globe, Lock, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { AddBlogPost } from "./AddBlogPost";
import { BlogPostDetail } from "./BlogPostDetail";
import { blogApi, categoriesApi } from "../../utils/api";
import { toast } from "sonner";

interface BlogPostData {
  id: string;
  title: string;
  excerpt: string;
  content?: string;
  coverImage: string;
  author: string;
  authorAvatar: string;
  status: "published" | "scheduled" | "private";
  publishDate: string;
  scheduledDate?: string;
  category: string;
  views: number;
  comments: number;
  likes: number;
  hasVideo: boolean;
  hasImages: boolean;
}

export function BlogPost() {
  const [showAddPost, setShowAddPost] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPostData | null>(null);
  const [viewingPost, setViewingPost] = useState<BlogPostData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [posts, setPosts] = useState<BlogPostData[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Load posts and categories on mount
  useEffect(() => {
    loadPosts();
    loadCategories();
  }, []);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const response = await blogApi.getAll();
      if (response.success && response.data) {
        setPosts(response.data);
        console.log("✅ Loaded blog posts:", response.data.length);
      }
    } catch (error) {
      console.error("Failed to load blog posts:", error);
      toast.error("Failed to load blog posts");
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await categoriesApi.getAll();
      if (response.success && response.data) {
        setCategories(response.data);
        console.log("✅ Loaded blog categories:", response.data.length);
      }
    } catch (error) {
      console.error("Failed to load blog categories:", error);
    }
  };

  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         post.excerpt.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || post.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || post.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const handleSavePost = async (data: any) => {
    try {
      console.log("📝 handleSavePost called with data:", data);
      
      if (editingPost) {
        // Update existing post
        console.log("🔄 Updating existing post:", editingPost.id);
        const response = await blogApi.update(editingPost.id, {
          title: data.title,
          excerpt: data.excerpt,
          content: data.content,
          coverImage: data.coverImage,
          author: data.author,
          status: data.status,
          publishDate: data.publishDate,
          scheduledDate: data.scheduledDate,
          category: data.category,
          hasVideo: data.hasVideo || false,
          hasImages: data.hasImages || false,
        });
        
        console.log("✅ Update response:", response);
        
        if (response.success) {
          toast.success("Blog post updated successfully");
          setEditingPost(null);
          setShowAddPost(false);
          await loadPosts(); // Reload posts from server
        }
      } else {
        // Create new post
        console.log("➕ Creating new post");
        const response = await blogApi.create({
          title: data.title,
          excerpt: data.excerpt,
          content: data.content,
          coverImage: data.coverImage || "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&h=400&fit=crop",
          author: data.author || "Admin User",
          authorAvatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${data.author || "Admin"}`,
          status: data.status,
          publishDate: data.publishDate,
          scheduledDate: data.scheduledDate,
          category: data.category,
          views: 0,
          comments: 0,
          likes: 0,
          hasVideo: data.hasVideo || false,
          hasImages: data.hasImages || false,
        });
        
        console.log("✅ Create response:", response);
        
        if (response.success) {
          toast.success("Blog post created successfully");
          setShowAddPost(false);
          console.log("🔄 Reloading posts...");
          await loadPosts(); // Reload posts from server
        } else {
          console.error("❌ Create failed - no success flag");
          toast.error("Failed to save blog post");
        }
      }
    } catch (error) {
      console.error("❌ Failed to save blog post:", error);
      toast.error("Failed to save blog post");
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      const response = await blogApi.delete(postId);
      if (response.success) {
        toast.success("Blog post deleted successfully");
        await loadPosts(); // Reload posts from server
      }
    } catch (error) {
      console.error("Failed to delete blog post:", error);
      toast.error("Failed to delete blog post");
    }
  };

  const getStatusBadge = (status: string, scheduledDate?: string) => {
    switch (status) {
      case "published":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><Globe className="w-3 h-3 mr-1" />Published</Badge>;
      case "scheduled":
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100"><Calendar className="w-3 h-3 mr-1" />Scheduled</Badge>;
      case "private":
        return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100"><Lock className="w-3 h-3 mr-1" />Private</Badge>;
      default:
        return null;
    }
  };

  if (showAddPost || editingPost) {
    return <AddBlogPost 
      post={editingPost || undefined}
      categories={categories}
      onBack={() => {
        setShowAddPost(false);
        setEditingPost(null);
      }} 
      onSave={handleSavePost} 
    />;
  }

  if (viewingPost) {
    return <BlogPostDetail 
      post={viewingPost} 
      onBack={() => setViewingPost(null)} 
    />;
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Blog posts</h1>
              <p className="text-sm text-slate-500 mt-0.5">Create and manage your blog content</p>
            </div>
            <Button 
              onClick={() => setShowAddPost(true)}
              className="bg-slate-900 hover:bg-slate-800 text-white"
            >
              Create post
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-6 py-4">
          <div className="flex flex-col gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search blog posts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10"
              />
            </div>

            {/* Filter Row */}
            <div className="flex gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map(category => (
                    <SelectItem key={category.id} value={category.name}>{category.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Posts List */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          {loading ? (
            /* Loading State */
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-500">Loading blog posts...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="mb-6 flex items-center gap-6 text-sm text-slate-600">
                <span>{filteredPosts.length} posts</span>
                <span className="h-4 w-px bg-slate-300"></span>
                <span>{posts.filter(p => p.status === "published").length} published</span>
                <span>{posts.filter(p => p.status === "scheduled").length} scheduled</span>
                <span>{posts.filter(p => p.status === "private").length} private</span>
              </div>

              {/* Posts Table */}
              {filteredPosts.length > 0 ? (
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-600 w-[400px]">Post</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">Author</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">Status</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">Category</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">Date</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">Engagement</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-600 w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPosts.map((post) => (
                        <tr key={post.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors">
                          {/* Post Info */}
                          <td className="py-4 px-4">
                            <div className="flex gap-3">
                              {/* Cover Image */}
                              <div className="relative w-20 h-14 flex-shrink-0 rounded overflow-hidden bg-slate-100">
                                <img
                                  src={post.coverImage}
                                  alt={post.title}
                                  className="w-full h-full object-cover"
                                />
                                {/* Media badges */}
                                <div className="absolute bottom-1 left-1 flex gap-1">
                                  {post.hasVideo && (
                                    <div className="bg-black/70 text-white backdrop-blur-sm text-[10px] px-1 py-0.5 rounded">
                                      Video
                                    </div>
                                  )}
                                  {post.hasImages && (
                                    <div className="bg-black/70 text-white backdrop-blur-sm text-[10px] px-1 py-0.5 rounded">
                                      Images
                                    </div>
                                  )}
                                </div>
                              </div>
                              {/* Title & Excerpt */}
                              <div className="flex-1 min-w-0">
                                <h3 
                                  className="font-medium text-sm text-slate-900 mb-1 line-clamp-1 cursor-pointer hover:text-slate-600 transition-colors"
                                  onClick={() => setViewingPost(post)}
                                >
                                  {post.title}
                                </h3>
                                <p className="text-xs text-slate-500 line-clamp-2">
                                  {post.excerpt}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Author */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <img
                                src={post.authorAvatar}
                                alt={post.author}
                                className="w-6 h-6 rounded-full flex-shrink-0"
                              />
                              <span className="text-sm text-slate-700">{post.author}</span>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-4 px-4">
                            {getStatusBadge(post.status, post.scheduledDate)}
                          </td>

                          {/* Category */}
                          <td className="py-4 px-4">
                            <span className="text-sm text-slate-700">{post.category}</span>
                          </td>

                          {/* Date */}
                          <td className="py-4 px-4">
                            <div className="text-sm text-slate-700">
                              {post.status === "scheduled" && post.scheduledDate ? (
                                <div>
                                  <div className="font-medium">{new Date(post.scheduledDate).toLocaleDateString()}</div>
                                  <div className="text-xs text-slate-500">Scheduled</div>
                                </div>
                              ) : (
                                new Date(post.publishDate).toLocaleDateString()
                              )}
                            </div>
                          </td>

                          {/* Engagement */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1 text-slate-500">
                                <Eye className="w-3.5 h-3.5" />
                                <span className="text-xs font-medium">{post.views.toLocaleString()}</span>
                              </div>
                              <div className="flex items-center gap-1 text-slate-500">
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span className="text-xs font-medium">{post.comments}</span>
                              </div>
                              <div className="flex items-center gap-1 text-slate-500">
                                <Heart className="w-3.5 h-3.5" />
                                <span className="text-xs font-medium">{post.likes}</span>
                              </div>
                            </div>
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
                                <DropdownMenuItem onClick={() => setViewingPost(post)}>
                                  <MessageCircle className="w-4 h-4 mr-2" />
                                  View comments
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setEditingPost(post)}>Edit post</DropdownMenuItem>
                                <DropdownMenuItem>Duplicate</DropdownMenuItem>
                                <DropdownMenuItem>View analytics</DropdownMenuItem>
                                <DropdownMenuItem className="text-red-600" onClick={() => handleDeletePost(post.id)}>Delete post</DropdownMenuItem>
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
                  <h3 className="text-lg font-medium text-slate-900 mb-1">No posts found</h3>
                  <p className="text-sm text-slate-500">Try adjusting your search or filters</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}