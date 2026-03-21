import { useState, useEffect } from "react";
import { ArrowLeft, Heart, MessageCircle, Send, MoreVertical, Eye, Calendar, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { toast } from "sonner";
import { blogCommentsApi, blogLikesApi } from "../../utils/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface Comment {
  id: string;
  postId: string;
  author: string;
  authorAvatar: string;
  content: string;
  parentId: string | null;
  timestamp: string;
  likes: number;
  isLiked: boolean;
  createdAt: string;
}

interface BlogPostDetailProps {
  post: {
    id: string;
    title: string;
    excerpt: string;
    coverImage: string;
    author: string;
    authorAvatar: string;
    status: string;
    publishDate: string;
    category: string;
    views: number;
    comments: number;
    likes: number;
  };
  onBack: () => void;
}

export function BlogPostDetail({ post, onBack }: BlogPostDetailProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [loadingComments, setLoadingComments] = useState(true);
  const [postLikes, setPostLikes] = useState(post.likes || 0);
  const [isPostLiked, setIsPostLiked] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  // Get current user from localStorage
  const getCurrentUser = () => {
    const user = localStorage.getItem("migoo-user");
    if (user) {
      const parsed = JSON.parse(user);
      return {
        name: parsed.name || "Anonymous User",
        avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${parsed.name || 'user'}`
      };
    }
    return {
      name: "Anonymous User",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=anonymous"
    };
  };

  const currentUser = getCurrentUser();

  // Load comments on mount
  useEffect(() => {
    loadComments();
  }, [post.id]);

  const loadComments = async () => {
    try {
      setLoadingComments(true);
      const response = await blogCommentsApi.getComments(post.id);
      if (response.success) {
        setComments(response.data);
        console.log(`✅ Loaded ${response.data.length} comments`);
      }
    } catch (error) {
      console.error("Failed to load comments:", error);
      toast.error("Failed to load comments");
    } finally {
      setLoadingComments(false);
    }
  };

  // Build comment tree structure
  const buildCommentTree = (comments: Comment[]): Comment[] => {
    const commentMap = new Map<string, Comment & { replies: Comment[] }>();
    const rootComments: (Comment & { replies: Comment[] })[] = [];

    // First pass: create map
    comments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // Second pass: build tree
    comments.forEach(comment => {
      const commentNode = commentMap.get(comment.id)!;
      if (comment.parentId) {
        const parent = commentMap.get(comment.parentId);
        if (parent) {
          parent.replies.push(commentNode);
        } else {
          rootComments.push(commentNode);
        }
      } else {
        rootComments.push(commentNode);
      }
    });

    return rootComments;
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    try {
      setSubmittingComment(true);
      const response = await blogCommentsApi.createComment(post.id, {
        author: currentUser.name,
        authorAvatar: currentUser.avatar,
        content: newComment,
        parentId: null,
      });

      if (response.success) {
        toast.success("Comment posted!");
        setNewComment("");
        // Reload comments to get updated list
        await loadComments();
      }
    } catch (error) {
      console.error("Failed to post comment:", error);
      toast.error("Failed to post comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleAddReply = async (parentId: string) => {
    if (!replyContent.trim()) return;

    try {
      const response = await blogCommentsApi.createComment(post.id, {
        author: currentUser.name,
        authorAvatar: currentUser.avatar,
        content: replyContent,
        parentId,
      });

      if (response.success) {
        toast.success("Reply posted!");
        setReplyContent("");
        setReplyingTo(null);
        // Reload comments to get updated list
        await loadComments();
      }
    } catch (error) {
      console.error("Failed to post reply:", error);
      toast.error("Failed to post reply");
    }
  };

  const handleLikeComment = async (commentId: string) => {
    try {
      const response = await blogCommentsApi.toggleLike(commentId);
      if (response.success) {
        // Update local state
        setComments(prevComments => 
          prevComments.map(c => 
            c.id === commentId 
              ? { ...c, likes: response.data.likes, isLiked: response.data.isLiked }
              : c
          )
        );
      }
    } catch (error) {
      console.error("Failed to like comment:", error);
      toast.error("Failed to like comment");
    }
  };

  const handleLikePost = async () => {
    try {
      const response = await blogLikesApi.toggleLike(post.id);
      if (response.success) {
        setPostLikes(response.data.likes);
        setIsPostLiked(response.data.isLiked);
        toast.success(response.data.isLiked ? "Post liked!" : "Post unliked");
      }
    } catch (error) {
      console.error("Failed to like post:", error);
      toast.error("Failed to like post");
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const response = await blogCommentsApi.deleteComment(commentId);
      if (response.success) {
        toast.success("Comment deleted");
        await loadComments();
      }
    } catch (error) {
      console.error("Failed to delete comment:", error);
      toast.error("Failed to delete comment");
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    return date.toLocaleDateString();
  };

  const renderComment = (comment: Comment & { replies: Comment[] }, isReply: boolean = false) => (
    <div key={comment.id} className={`${isReply ? 'ml-12 mt-4' : ''}`}>
      <div className="flex gap-3">
        {/* Avatar */}
        <img
          src={comment.authorAvatar}
          alt={comment.author}
          className="w-10 h-10 rounded-full flex-shrink-0"
        />
        
        {/* Comment Content */}
        <div className="flex-1 min-w-0">
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-900">{comment.author}</span>
                <span className="text-xs text-slate-500">{formatTimestamp(comment.timestamp || comment.createdAt)}</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleDeleteComment(comment.id)} className="text-red-600">
                    Delete comment
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{comment.content}</p>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-4 mt-2 ml-1">
            <button
              onClick={() => handleLikeComment(comment.id)}
              className={`flex items-center gap-1.5 text-sm transition-colors ${
                comment.isLiked 
                  ? 'text-rose-600 font-medium' 
                  : 'text-slate-500 hover:text-rose-600'
              }`}
            >
              <Heart className={`w-4 h-4 ${comment.isLiked ? 'fill-current' : ''}`} />
              <span>{comment.likes > 0 ? comment.likes : 'Like'}</span>
            </button>
            <button
              onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Reply</span>
            </button>
          </div>

          {/* Reply Input */}
          {replyingTo === comment.id && (
            <div className="mt-3 flex gap-2">
              <img
                src={currentUser.avatar}
                alt="You"
                className="w-8 h-8 rounded-full flex-shrink-0"
              />
              <div className="flex-1">
                <Textarea
                  placeholder="Write a reply..."
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  className="min-h-[60px] resize-none text-sm"
                />
                <div className="flex justify-end gap-2 mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setReplyingTo(null);
                      setReplyContent("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleAddReply(comment.id)}
                    className="bg-slate-900 hover:bg-slate-800 text-white"
                    disabled={!replyContent.trim()}
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    Reply
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Nested Replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-4 space-y-4">
              {comment.replies.map(reply => renderComment(reply, true))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const commentTree = buildCommentTree(comments);

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Blog post details</h1>
              <p className="text-sm text-slate-500">View post and manage comments</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-8 px-6">
          {/* Post Header */}
          <div className="bg-white rounded-lg border border-slate-200 p-8 mb-6">
            {/* Category & Status */}
            <div className="flex items-center gap-3 mb-4">
              <Badge variant="secondary" className="text-xs">
                {post.category}
              </Badge>
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">
                Published
              </Badge>
            </div>

            {/* Title */}
            <h1 className="text-3xl font-bold text-slate-900 mb-4">{post.title}</h1>

            {/* Meta Info */}
            <div className="flex items-center gap-6 text-sm text-slate-600 mb-6">
              <div className="flex items-center gap-2">
                <img
                  src={post.authorAvatar}
                  alt={post.author}
                  className="w-6 h-6 rounded-full"
                />
                <span>{post.author}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <span>{new Date(post.publishDate).toLocaleDateString('en-US', { 
                  month: 'long', 
                  day: 'numeric', 
                  year: 'numeric' 
                })}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-4 h-4" />
                  {post.views.toLocaleString()} views
                </span>
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4" />
                  {comments.length} comments
                </span>
                <button 
                  onClick={handleLikePost}
                  className={`flex items-center gap-1.5 transition-colors ${
                    isPostLiked ? 'text-rose-600' : 'hover:text-rose-600'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isPostLiked ? 'fill-current' : ''}`} />
                  {postLikes} likes
                </button>
              </div>
            </div>

            {/* Cover Image */}
            <div className="aspect-video rounded-lg overflow-hidden mb-6">
              <img
                src={post.coverImage}
                alt={post.title}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Excerpt */}
            <p className="text-lg text-slate-700 leading-relaxed mb-6">
              {post.excerpt}
            </p>

            {/* Mock Content */}
            <div className="prose prose-slate max-w-none">
              <p className="text-slate-700 leading-relaxed mb-4">
                In today's competitive e-commerce landscape, high-quality product photography isn't just nice to have—it's essential. 
                Studies show that products with professional photos convert up to 30% better than those without.
              </p>
              <p className="text-slate-700 leading-relaxed mb-4">
                Whether you're a seasoned seller or just starting out, these tips will help you capture images that not only 
                showcase your products but also tell their story and connect with your customers on an emotional level.
              </p>
              <p className="text-slate-700 leading-relaxed">
                From lighting techniques to composition rules, we'll cover everything you need to know to take your product 
                photography to the next level and boost your conversion rates.
              </p>
            </div>
          </div>

          {/* Comments Section */}
          <div className="bg-white rounded-lg border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">
              Comments ({comments.length})
            </h2>

            {/* Add Comment */}
            <div className="mb-8">
              <div className="flex gap-3">
                <img
                  src={currentUser.avatar}
                  alt="You"
                  className="w-10 h-10 rounded-full flex-shrink-0"
                />
                <div className="flex-1">
                  <Textarea
                    placeholder="Write a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="min-h-[60px] resize-none"
                  />
                  <div className="flex justify-end mt-3">
                    <Button
                      onClick={handleAddComment}
                      className="bg-slate-900 hover:bg-slate-800 text-white"
                      disabled={!newComment.trim() || submittingComment}
                    >
                      {submittingComment ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Posting...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Post comment
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Comments List */}
            {loadingComments ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
              </div>
            ) : commentTree.length > 0 ? (
              <div className="space-y-6">
                {commentTree.map(comment => renderComment(comment))}
              </div>
            ) : (
              <div className="text-center py-12">
                <MessageCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-1">No comments yet</h3>
                <p className="text-sm text-slate-500">Be the first to share your thoughts!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
