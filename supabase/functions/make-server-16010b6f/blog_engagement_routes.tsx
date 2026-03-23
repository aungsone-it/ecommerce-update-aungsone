import { Hono } from "npm:hono@4";
import * as kv from "./kv_store.tsx";

const blogEngagementApp = new Hono();

// Helper function for timeout
const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
};

// ============================================
// BLOG COMMENTS ENDPOINTS
// ============================================

// Get comments for a blog post
blogEngagementApp.get("/blog-posts/:postId/comments", async (c) => {
  try {
    const postId = c.req.param("postId");
    console.log(`🔍 Fetching comments for blog post: ${postId}`);
    
    const comments = await withTimeout(kv.getByPrefix(`comment:${postId}:`), 5000);
    const validComments = Array.isArray(comments) ? comments.filter(c => c != null) : [];
    
    console.log(`✅ Found ${validComments.length} comments for post ${postId}`);
    
    return c.json({ 
      success: true,
      data: validComments
    });
  } catch (error) {
    console.error("❌ Error fetching comments:", error);
    return c.json({ success: false, error: "Failed to fetch comments", data: [] }, 500);
  }
});

// Create a comment on a blog post
blogEngagementApp.post("/blog-posts/:postId/comments", async (c) => {
  try {
    const postId = c.req.param("postId");
    const body = await c.req.json();
    console.log(`📝 Creating comment for blog post: ${postId}`);
    
    const commentId = `comment_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const commentData = {
      id: commentId,
      postId,
      author: body.author || "Anonymous",
      authorAvatar: body.authorAvatar || "https://api.dicebear.com/7.x/pixel-art/svg?seed=Anonymous",
      content: body.content,
      parentId: body.parentId || null, // For replies
      timestamp: new Date().toISOString(),
      likes: 0,
      isLiked: false,
      createdAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`comment:${postId}:${commentId}`, commentData), 5000);
    
    // Update comment count on the blog post
    const post = await withTimeout(kv.get(`blog:${postId}`), 5000);
    if (post) {
      const currentComments = post.comments || 0;
      await withTimeout(kv.set(`blog:${postId}`, {
        ...post,
        comments: currentComments + 1,
        updatedAt: new Date().toISOString()
      }), 5000);
    }
    
    // Create notification for post author (if not commenting on own post)
    if (post && post.author !== body.author) {
      const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const notificationData = {
        id: notificationId,
        type: "comment",
        postId,
        postTitle: post.title,
        commentId,
        author: body.author,
        authorAvatar: body.authorAvatar,
        content: body.content,
        read: false,
        createdAt: new Date().toISOString(),
      };
      await withTimeout(kv.set(`notification:${notificationId}`, notificationData), 5000);
      console.log(`✅ Created notification for new comment on post ${postId}`);
    }
    
    console.log(`✅ Comment created: ${commentId}`);
    
    return c.json({ 
      success: true,
      data: commentData,
      message: "Comment created successfully"
    }, 201);
  } catch (error) {
    console.error("❌ Error creating comment:", error);
    return c.json({ success: false, error: "Failed to create comment" }, 500);
  }
});

// Update a comment
blogEngagementApp.put("/comments/:commentId", async (c) => {
  try {
    const commentId = c.req.param("commentId");
    const body = await c.req.json();
    
    // Find the comment (need to search by prefix since we don't know the postId)
    // Increased timeout for prefix scan operation
    const allComments = await withTimeout(kv.getByPrefix(`comment:`), 15000);
    const existingComment = allComments.find((c: any) => c.id === commentId);
    
    if (!existingComment) {
      return c.json({ success: false, error: "Comment not found" }, 404);
    }
    
    const updatedComment = {
      ...existingComment,
      content: body.content,
      updatedAt: new Date().toISOString()
    };
    
    await withTimeout(kv.set(`comment:${existingComment.postId}:${commentId}`, updatedComment), 5000);
    
    console.log(`✅ Comment updated: ${commentId}`);
    
    return c.json({ 
      success: true,
      data: updatedComment,
      message: "Comment updated successfully"
    });
  } catch (error) {
    console.error("❌ Error updating comment:", error);
    return c.json({ success: false, error: "Failed to update comment" }, 500);
  }
});

// Delete a comment
blogEngagementApp.delete("/comments/:commentId", async (c) => {
  try {
    const commentId = c.req.param("commentId");
    
    // Find the comment - Increased timeout for prefix scan
    const allComments = await withTimeout(kv.getByPrefix(`comment:`), 15000);
    const existingComment = allComments.find((c: any) => c.id === commentId);
    
    if (!existingComment) {
      return c.json({ success: false, error: "Comment not found" }, 404);
    }
    
    await withTimeout(kv.del(`comment:${existingComment.postId}:${commentId}`), 5000);
    
    // Update comment count on the blog post
    const post = await withTimeout(kv.get(`blog:${existingComment.postId}`), 5000);
    if (post && post.comments > 0) {
      await withTimeout(kv.set(`blog:${existingComment.postId}`, {
        ...post,
        comments: post.comments - 1,
        updatedAt: new Date().toISOString()
      }), 5000);
    }
    
    console.log(`✅ Comment deleted: ${commentId}`);
    
    return c.json({ 
      success: true,
      message: "Comment deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error deleting comment:", error);
    return c.json({ success: false, error: "Failed to delete comment" }, 500);
  }
});

// Like/Unlike a comment
blogEngagementApp.post("/comments/:commentId/like", async (c) => {
  try {
    const commentId = c.req.param("commentId");
    
    // Find the comment - Increased timeout for prefix scan
    const allComments = await withTimeout(kv.getByPrefix(`comment:`), 15000);
    const existingComment = allComments.find((c: any) => c.id === commentId);
    
    if (!existingComment) {
      return c.json({ success: false, error: "Comment not found" }, 404);
    }
    
    const updatedComment = {
      ...existingComment,
      likes: existingComment.isLiked ? existingComment.likes - 1 : existingComment.likes + 1,
      isLiked: !existingComment.isLiked,
      updatedAt: new Date().toISOString()
    };
    
    await withTimeout(kv.set(`comment:${existingComment.postId}:${commentId}`, updatedComment), 5000);
    
    console.log(`✅ Comment ${existingComment.isLiked ? 'unliked' : 'liked'}: ${commentId}`);
    
    return c.json({ 
      success: true,
      data: updatedComment,
      message: existingComment.isLiked ? "Comment unliked" : "Comment liked"
    });
  } catch (error) {
    console.error("❌ Error liking comment:", error);
    return c.json({ success: false, error: "Failed to like comment" }, 500);
  }
});

// ============================================
// BLOG POST LIKES ENDPOINTS
// ============================================

// Like/Unlike a blog post
blogEngagementApp.post("/blog-posts/:postId/like", async (c) => {
  try {
    const postId = c.req.param("postId");
    const body = await c.req.json();
    
    const post = await withTimeout(kv.get(`blog:${postId}`), 5000);
    if (!post) {
      return c.json({ success: false, error: "Blog post not found" }, 404);
    }
    
    const likeKey = `like:${postId}:${body.userId || 'anonymous'}`;
    const existingLike = await withTimeout(kv.get(likeKey), 5000);
    
    let updatedLikes = post.likes || 0;
    let isLiked = false;
    
    if (existingLike) {
      // Unlike
      await withTimeout(kv.del(likeKey), 5000);
      updatedLikes = Math.max(0, updatedLikes - 1);
      isLiked = false;
      console.log(`✅ Blog post unliked: ${postId}`);
    } else {
      // Like
      await withTimeout(kv.set(likeKey, { postId, userId: body.userId, timestamp: new Date().toISOString() }), 5000);
      updatedLikes = updatedLikes + 1;
      isLiked = true;
      console.log(`✅ Blog post liked: ${postId}`);
    }
    
    // Update post likes count
    const updatedPost = {
      ...post,
      likes: updatedLikes,
      updatedAt: new Date().toISOString()
    };
    await withTimeout(kv.set(`blog:${postId}`, updatedPost), 5000);
    
    return c.json({ 
      success: true,
      data: { likes: updatedLikes, isLiked },
      message: isLiked ? "Blog post liked" : "Blog post unliked"
    });
  } catch (error) {
    console.error("❌ Error liking blog post:", error);
    return c.json({ success: false, error: "Failed to like blog post" }, 500);
  }
});

// ============================================
// NOTIFICATIONS ENDPOINTS
// ============================================

// Get all notifications
blogEngagementApp.get("/notifications", async (c) => {
  try {
    console.log("🔔 Fetching notifications...");
    
    // kv.getByPrefix already has 30s timeout
    const notifications = await kv.getByPrefix("notification:");
    const validNotifications = Array.isArray(notifications) ? notifications.filter(n => n != null) : [];
    
    // Sort by createdAt descending (newest first)
    validNotifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    console.log(`✅ Found ${validNotifications.length} notifications`);
    
    return c.json({ 
      success: true,
      data: validNotifications,
      unreadCount: validNotifications.filter(n => !n.read).length
    });
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    return c.json({ success: false, error: "Failed to fetch notifications", data: [], unreadCount: 0 }, 500);
  }
});

// Mark notification as read
blogEngagementApp.put("/notifications/:id/read", async (c) => {
  try {
    const id = c.req.param("id");
    
    const notification = await withTimeout(kv.get(`notification:${id}`), 5000);
    if (!notification) {
      return c.json({ success: false, error: "Notification not found" }, 404);
    }
    
    const updatedNotification = {
      ...notification,
      read: true,
      readAt: new Date().toISOString()
    };
    
    await withTimeout(kv.set(`notification:${id}`, updatedNotification), 5000);
    
    console.log(`✅ Notification marked as read: ${id}`);
    
    return c.json({ 
      success: true,
      data: updatedNotification,
      message: "Notification marked as read"
    });
  } catch (error) {
    console.error("❌ Error marking notification as read:", error);
    return c.json({ success: false, error: "Failed to mark notification as read" }, 500);
  }
});

// Mark all notifications as read
blogEngagementApp.put("/notifications/read-all", async (c) => {
  try {
    console.log("🔔 Marking all notifications as read...");
    
    // kv.getByPrefix already has 30s timeout
    const notifications = await kv.getByPrefix("notification:");
    const validNotifications = Array.isArray(notifications) ? notifications.filter(n => n != null && !n.read) : [];
    
    for (const notification of validNotifications) {
      await withTimeout(kv.set(`notification:${notification.id}`, {
        ...notification,
        read: true,
        readAt: new Date().toISOString()
      }), 5000);
    }
    
    console.log(`✅ Marked ${validNotifications.length} notifications as read`);
    
    return c.json({ 
      success: true,
      message: `Marked ${validNotifications.length} notifications as read`
    });
  } catch (error) {
    console.error("❌ Error marking all notifications as read:", error);
    return c.json({ success: false, error: "Failed to mark all notifications as read" }, 500);
  }
});

// Delete a notification
blogEngagementApp.delete("/notifications/:id", async (c) => {
  try {
    const id = c.req.param("id");
    
    const notification = await withTimeout(kv.get(`notification:${id}`), 5000);
    if (!notification) {
      return c.json({ success: false, error: "Notification not found" }, 404);
    }
    
    await withTimeout(kv.del(`notification:${id}`), 5000);
    
    console.log(`✅ Notification deleted: ${id}`);
    
    return c.json({ 
      success: true,
      message: "Notification deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error deleting notification:", error);
    return c.json({ success: false, error: "Failed to delete notification" }, 500);
  }
});

export default blogEngagementApp;