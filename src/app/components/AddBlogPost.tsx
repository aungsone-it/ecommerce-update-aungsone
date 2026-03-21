import { useState } from "react";
import { ArrowLeft, Upload, X, Plus, Calendar as CalendarIcon, Image as ImageIcon, Video as VideoIcon, File } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { toast } from "sonner";
import { compressImage, compressMultipleImages } from "../../utils/imageCompression";

interface AddBlogPostProps {
  onBack?: () => void;
  onSave?: (data: any) => void;
  categories?: any[]; // Dynamic categories from database
  post?: {
    id: string;
    title: string;
    excerpt: string;
    coverImage: string;
    author: string;
    status: "published" | "scheduled" | "private";
    publishDate: string;
    scheduledDate?: string;
    category: string;
  };
}

export function AddBlogPost({ onBack, onSave, post, categories = [] }: AddBlogPostProps) {
  const [title, setTitle] = useState(post?.title || "");
  const [excerpt, setExcerpt] = useState(post?.excerpt || "");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState(post?.category || "");
  const [author, setAuthor] = useState(post?.author || "");
  const [status, setStatus] = useState<"published" | "scheduled" | "private">(post?.status || "private");
  const [publishDate, setPublishDate] = useState(post?.publishDate || "");
  const [scheduledDate, setScheduledDate] = useState(post?.scheduledDate || "");
  const [coverImage, setCoverImage] = useState(post?.coverImage || "");
  const [showCoverImageInput, setShowCoverImageInput] = useState(false);
  const [coverImageInput, setCoverImageInput] = useState("");
  
  // Media in content
  const [contentImages, setContentImages] = useState<string[]>([]);
  const [contentVideos, setContentVideos] = useState<string[]>([]);
  const [showImageInput, setShowImageInput] = useState(false);
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [videoUrlInput, setVideoUrlInput] = useState("");

  // SEO
  const [metaDescription, setMetaDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Loading and error states
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const addCoverImage = () => {
    if (coverImageInput.trim()) {
      setCoverImage(coverImageInput.trim());
      setCoverImageInput("");
      setShowCoverImageInput(false);
    }
  };

  const addContentImage = () => {
    if (imageUrlInput.trim()) {
      setContentImages([...contentImages, imageUrlInput.trim()]);
      setImageUrlInput("");
      setShowImageInput(false);
    }
  };

  const addContentVideo = () => {
    if (videoUrlInput.trim()) {
      setContentVideos([...contentVideos, videoUrlInput.trim()]);
      setVideoUrlInput("");
      setShowVideoInput(false);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  // File upload handlers
  const handleCoverImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image file`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    try {
      // Compress cover image to max 500KB
      const compressedImage = await compressImage(validFiles[0], 500);
      setCoverImage(compressedImage);
      toast.success(`Cover image compressed and uploaded successfully!`);
    } catch (error) {
      console.error('Image compression error:', error);
      toast.error('Failed to compress image. Please try a smaller file.');
    }

    // Reset the input
    e.target.value = '';
  };

  const handleContentImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image file`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    try {
      // Compress all images to max 500KB each
      const compressedImages = await compressMultipleImages(validFiles, 500);
      setContentImages([...contentImages, ...compressedImages]);
      toast.success(`${validFiles.length} image(s) compressed and uploaded successfully!`);
    } catch (error) {
      console.error('Image compression error:', error);
      toast.error('Failed to compress images. Please try smaller files.');
    }

    // Reset the input
    e.target.value = '';
  };

  const handleContentVideosUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles = files.filter(file => {
      if (!file.type.startsWith('video/')) {
        toast.error(`${file.name} is not a video file`);
        return false;
      }
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 50MB`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    Promise.all(
      validFiles.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      })
    ).then(videos => {
      setContentVideos([...contentVideos, ...videos]);
      toast.success(`${validFiles.length} video(s) uploaded successfully`);
    });

    // Reset the input
    e.target.value = '';
  };

  const handleSave = async () => {
    // Validation
    const newErrors: { [key: string]: string } = {};
    
    if (!title.trim()) {
      newErrors.title = "Title is required";
    }
    if (!excerpt.trim()) {
      newErrors.excerpt = "Excerpt is required";
    }
    if (!content.trim()) {
      newErrors.content = "Content is required";
    }
    if (!author.trim()) {
      newErrors.author = "Author is required";
    }
    if (status === "scheduled" && !scheduledDate) {
      newErrors.scheduledDate = "Scheduled date is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error("Please fill in all required fields");
      return;
    }

    setErrors({});
    setIsSaving(true);

    try {
      // Auto-set publish date to today for published posts
      const finalPublishDate = status === "published" 
        ? new Date().toISOString().split("T")[0]
        : (publishDate || new Date().toISOString().split("T")[0]);

      const data = {
        title,
        excerpt,
        content,
        category: category || "Uncategorized", // Default to "Uncategorized" if no category selected
        author,
        status,
        publishDate: finalPublishDate,
        scheduledDate: status === "scheduled" ? scheduledDate : undefined,
        coverImage,
        hasImages: contentImages.length > 0,
        hasVideo: contentVideos.length > 0,
        metaDescription,
        tags,
        contentImages,
        contentVideos,
      };
      
      console.log("💾 Saving blog post with data:", data);
      
      await onSave?.(data);
      // Don't show toast here - parent component will handle it
    } catch (error) {
      console.error("Error saving blog post:", error);
      toast.error("Failed to save blog post");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-slate-900">{post ? "Edit blog post" : "Create blog post"}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onBack} disabled={isSaving}>
              Cancel
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave} 
              className="bg-slate-900 hover:bg-slate-800 text-white"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save post"}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-scroll">
        <div className="w-[80%] mx-auto py-6 px-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Left Column - Main Form */}
            <div className="xl:col-span-2 space-y-6">
              {/* Title & Content */}
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div>
                    <Label htmlFor="title" className="text-sm font-medium text-slate-900 mb-2 block">
                      Title
                    </Label>
                    <Input
                      id="title"
                      placeholder="Enter an engaging title..."
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="h-10 text-base"
                    />
                    {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
                  </div>
                  <div>
                    <Label htmlFor="excerpt" className="text-sm font-medium text-slate-900 mb-2 block">
                      Excerpt
                    </Label>
                    <Textarea
                      id="excerpt"
                      placeholder="Write a brief summary (shown in preview cards)..."
                      value={excerpt}
                      onChange={(e) => setExcerpt(e.target.value)}
                      className="min-h-[80px] resize-y"
                    />
                    {errors.excerpt && <p className="text-xs text-red-500 mt-1">{errors.excerpt}</p>}
                  </div>
                  <div>
                    <Label htmlFor="content" className="text-sm font-medium text-slate-900 mb-2 block">
                      Content
                    </Label>
                    <Textarea
                      id="content"
                      placeholder="Write your blog post content here..."
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="min-h-[400px] resize-y font-normal"
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      {content.length} characters
                    </p>
                    {errors.content && <p className="text-xs text-red-500 mt-1">{errors.content}</p>}
                  </div>
                </CardContent>
              </Card>

              {/* Cover Image */}
              <Card>
                <CardHeader className="p-6 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-900">Cover image</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-0">
                  <input
                    type="file"
                    id="cover-image-upload"
                    accept="image/*"
                    multiple
                    onChange={handleCoverImageUpload}
                    className="hidden"
                  />
                  
                  {!coverImage && !showCoverImageInput && (
                    <div className="border-2 border-dashed border-slate-200 rounded-lg p-8">
                      <div className="flex flex-col items-center justify-center text-center gap-3">
                        <ImageIcon className="w-10 h-10 text-slate-300" />
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById('cover-image-upload')?.click()}
                            type="button"
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Upload image
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setShowCoverImageInput(true)}
                            type="button"
                          >
                            Add from URL
                          </Button>
                        </div>
                        <p className="text-xs text-slate-500">
                          Recommended size: 1200 x 630 pixels
                        </p>
                      </div>
                    </div>
                  )}

                  {showCoverImageInput && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Paste image URL..."
                          value={coverImageInput}
                          onChange={(e) => setCoverImageInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addCoverImage();
                          }}
                          className="h-10"
                        />
                        <Button size="sm" onClick={addCoverImage}>Add</Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowCoverImageInput(false)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {coverImage && (
                    <div className="relative group aspect-video rounded-lg overflow-hidden">
                      <img
                        src={coverImage}
                        alt="Cover"
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => setCoverImage("")}
                        className="absolute top-3 right-3 bg-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      >
                        <X className="w-4 h-4 text-slate-600" />
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Content Media */}
              <Card>
                <CardHeader className="p-6 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-900">Content media</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-0 space-y-6">
                  {/* Hidden file inputs */}
                  <input
                    type="file"
                    id="content-images-upload"
                    accept="image/*"
                    multiple
                    onChange={handleContentImagesUpload}
                    className="hidden"
                  />
                  <input
                    type="file"
                    id="content-videos-upload"
                    accept="video/*"
                    multiple
                    onChange={handleContentVideosUpload}
                    className="hidden"
                  />
                  
                  {/* Images */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-medium text-slate-700">Images</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('content-images-upload')?.click()}
                        className="h-8"
                        type="button"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add image
                      </Button>
                    </div>

                    {contentImages.length > 0 ? (
                      <div className="grid grid-cols-4 gap-3">
                        {contentImages.map((img, idx) => (
                          <div key={idx} className="relative group aspect-square">
                            <img
                              src={img}
                              alt={`Content ${idx + 1}`}
                              className="w-full h-full object-cover rounded-lg border border-slate-200"
                            />
                            <button
                              onClick={() => setContentImages(contentImages.filter((_, i) => i !== idx))}
                              className="absolute top-2 right-2 bg-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                            >
                              <X className="w-3 h-3 text-slate-600" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 text-center py-4 border border-dashed border-slate-200 rounded-lg">
                        No images added yet
                      </p>
                    )}
                  </div>

                  {/* Videos */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-medium text-slate-700">Videos</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('content-videos-upload')?.click()}
                        className="h-8"
                        type="button"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add video
                      </Button>
                    </div>

                    {contentVideos.length > 0 ? (
                      <div className="space-y-2">
                        {contentVideos.map((video, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 group">
                            <VideoIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                            <span className="text-sm text-slate-700 flex-1 truncate">
                              {video.startsWith('data:') ? `Video file ${idx + 1}` : video}
                            </span>
                            <button
                              onClick={() => setContentVideos(contentVideos.filter((_, i) => i !== idx))}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-4 h-4 text-slate-500 hover:text-slate-700" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 text-center py-4 border border-dashed border-slate-200 rounded-lg">
                        No videos added yet
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* SEO Settings */}
              <Card>
                <CardHeader className="p-6 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-900">SEO settings</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-0 space-y-4">
                  <div>
                    <Label htmlFor="metaDescription" className="text-sm font-medium text-slate-700 mb-2 block">
                      Meta description
                    </Label>
                    <Textarea
                      id="metaDescription"
                      placeholder="Brief description for search engines (150-160 characters)..."
                      value={metaDescription}
                      onChange={(e) => setMetaDescription(e.target.value)}
                      maxLength={160}
                      className="min-h-[80px] resize-y"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      {metaDescription.length}/160 characters
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-700 mb-2 block">
                      Tags
                    </Label>
                    <div className="flex gap-2 mb-2">
                      <Input
                        placeholder="Add a tag..."
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag();
                          }
                        }}
                        className="h-9"
                      />
                      <Button size="sm" onClick={addTag} className="h-9">Add</Button>
                    </div>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="px-2.5 py-1">
                            {tag}
                            <button
                              onClick={() => removeTag(tag)}
                              className="ml-2 hover:text-slate-900"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Settings */}
            <div className="xl:col-span-1 space-y-6">
              {/* Publishing */}
              <Card>
                <CardHeader className="p-6 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-900">Publishing</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-0 space-y-4">
                  <div>
                    <Label htmlFor="status" className="text-sm font-medium text-slate-700 mb-2 block">
                      Status
                    </Label>
                    <Select value={status} onValueChange={(value: any) => setStatus(value)}>
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="private">Private</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {status === "scheduled" && (
                    <div>
                      <Label htmlFor="scheduledDate" className="text-sm font-medium text-slate-700 mb-2 block">
                        Publish date & time
                      </Label>
                      <div className="relative">
                        <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          id="scheduledDate"
                          type="datetime-local"
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          className="pl-10 h-10"
                        />
                      </div>
                      {errors.scheduledDate && <p className="text-xs text-red-500 mt-1">{errors.scheduledDate}</p>}
                    </div>
                  )}

                  {status === "published" && (
                    <div className="text-sm text-slate-600">
                      <p>Will be published immediately with today's date</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Organization */}
              <Card>
                <CardHeader className="p-6 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-900">Organization</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-0 space-y-4">
                  <div>
                    <Label htmlFor="category" className="text-sm font-medium text-slate-700 mb-2 block">
                      Category
                    </Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.length > 0 ? (
                          categories.map((cat: any) => (
                            <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                          ))
                        ) : (
                          <SelectItem value="Uncategorized">Uncategorized</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {errors.category && <p className="text-xs text-red-500 mt-1">{errors.category}</p>}
                  </div>

                  <div>
                    <Label htmlFor="author" className="text-sm font-medium text-slate-700 mb-2 block">
                      Author
                    </Label>
                    <Input
                      id="author"
                      placeholder="Author name"
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      className="h-10"
                    />
                    {errors.author && <p className="text-xs text-red-500 mt-1">{errors.author}</p>}
                  </div>
                </CardContent>
              </Card>

              {/* Engagement Settings */}
              <Card>
                <CardHeader className="p-6 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-900">Engagement</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-0 space-y-3">
                  <div className="flex items-center justify-between py-2">
                    <Label className="text-sm text-slate-700 font-normal">Allow comments</Label>
                    <Checkbox defaultChecked />
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <Label className="text-sm text-slate-700 font-normal">Allow likes</Label>
                    <Checkbox defaultChecked />
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <Label className="text-sm text-slate-700 font-normal">Allow sharing</Label>
                    <Checkbox defaultChecked />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Bottom action buttons */}
          <div className="flex items-center justify-end gap-3 pt-6 pb-8">
            <Button variant="outline" onClick={onBack} disabled={isSaving}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              className="bg-slate-900 hover:bg-slate-800 text-white"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save post"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}