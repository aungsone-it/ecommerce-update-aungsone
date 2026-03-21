import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Video, VideoOff, Mic, MicOff, MonitorPlay, X, Plus, Eye, Heart, Share2, ShoppingBag, Send, Trash2, UserPlus, Radio, Search, MessageCircle } from "lucide-react";

interface Collaborator {
  id: string;
  name: string;
  avatar: string;
  followers: number;
  avgViewers: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  stock: number;
}

interface Comment {
  id: string;
  user: string;
  avatar: string;
  message: string;
  timestamp: Date;
  streamId: string;
  loves: number;
  replies?: Comment[];
  replyTo?: string;
}

interface LiveStreamData {
  id: string;
  collaborator: Collaborator;
  isLive: boolean;
  isCameraOn: boolean;
  isMicOn: boolean;
  viewerCount: number;
  likeCount: number;
  shareCount: number;
  products: Product[];
  comments: Comment[];
  startTime?: Date;
}

export function LiveStreamMulti() {
  const [activeStreams, setActiveStreams] = useState<LiveStreamData[]>([]);
  const [showCollaboratorSelector, setShowCollaboratorSelector] = useState(false);
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({});
  const [showProductSelector, setShowProductSelector] = useState<string | null>(null);
  const [collaboratorSearch, setCollaboratorSearch] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ streamId: string; commentId: string; userName: string } | null>(null);
  const commentEndRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Mock data for available collaborators
  const [availableCollaborators] = useState<Collaborator[]>([
    {
      id: "1",
      name: "Emma Johnson",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Emma",
      followers: 45200,
      avgViewers: 1250,
    },
    {
      id: "2",
      name: "Michael Chen",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Michael",
      followers: 38900,
      avgViewers: 980,
    },
    {
      id: "3",
      name: "Sarah Williams",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Sarah",
      followers: 52100,
      avgViewers: 1450,
    },
    {
      id: "4",
      name: "David Martinez",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=David",
      followers: 31500,
      avgViewers: 820,
    },
    {
      id: "5",
      name: "Lisa Anderson",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Lisa",
      followers: 47800,
      avgViewers: 1180,
    },
  ]);

  // Mock data for available products
  const [availableProducts] = useState<Product[]>([
    { id: "1", name: "Wireless Headphones", price: 79.99, image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200&h=200&fit=crop", stock: 45 },
    { id: "2", name: "Smart Watch", price: 199.99, image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&h=200&fit=crop", stock: 23 },
    { id: "3", name: "Laptop Stand", price: 49.99, image: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=200&h=200&fit=crop", stock: 67 },
    { id: "4", name: "Mechanical Keyboard", price: 129.99, image: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=200&h=200&fit=crop", stock: 34 },
    { id: "5", name: "Wireless Mouse", price: 39.99, image: "https://images.unsplash.com/photo-1527814050087-3793815479db?w=200&h=200&fit=crop", stock: 89 },
  ]);

  const handleStartStream = (collaborator: Collaborator) => {
    if (activeStreams.length >= 3) {
      alert("Maximum 3 concurrent streams allowed");
      return;
    }

    const streamId = Date.now().toString();
    const newStream: LiveStreamData = {
      id: streamId,
      collaborator,
      isLive: true,
      isCameraOn: true,
      isMicOn: true,
      viewerCount: Math.floor(Math.random() * 50) + 10,
      likeCount: Math.floor(Math.random() * 20) + 5,
      shareCount: Math.floor(Math.random() * 5),
      products: [],
      comments: [
        {
          id: "1",
          user: "Viewer123",
          avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Viewer1",
          message: "Hello! Excited for this stream! 🎉",
          timestamp: new Date(),
          streamId: streamId,
          loves: 0,
        },
        {
          id: "2",
          user: "ShopperJane",
          avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Jane",
          message: "What products are you showing today?",
          timestamp: new Date(),
          streamId: streamId,
          loves: 0,
        },
      ],
      startTime: new Date(),
    };

    setActiveStreams([...activeStreams, newStream]);
    setCommentInputs({ ...commentInputs, [streamId]: "" });
    setShowCollaboratorSelector(false);
  };

  const handleStopStream = (streamId: string) => {
    setActiveStreams(activeStreams.filter(s => s.id !== streamId));
    const newCommentInputs = { ...commentInputs };
    delete newCommentInputs[streamId];
    setCommentInputs(newCommentInputs);
  };

  const handleToggleCamera = (streamId: string) => {
    setActiveStreams(activeStreams.map(s => 
      s.id === streamId ? { ...s, isCameraOn: !s.isCameraOn } : s
    ));
  };

  const handleToggleMic = (streamId: string) => {
    setActiveStreams(activeStreams.map(s => 
      s.id === streamId ? { ...s, isMicOn: !s.isMicOn } : s
    ));
  };

  const handleAddProduct = (streamId: string, product: Product) => {
    setActiveStreams(activeStreams.map(s => {
      if (s.id === streamId) {
        if (!s.products.find(p => p.id === product.id)) {
          return { ...s, products: [...s.products, product] };
        }
      }
      return s;
    }));
    setShowProductSelector(null);
  };

  const handleRemoveProduct = (streamId: string, productId: string) => {
    setActiveStreams(activeStreams.map(s => 
      s.id === streamId ? { ...s, products: s.products.filter(p => p.id !== productId) } : s
    ));
  };

  const handleSendComment = (streamId: string) => {
    const comment = commentInputs[streamId] || "";
    if (comment.trim()) {
      const newComment: Comment = {
        id: `admin-${Date.now()}`,
        user: "Admin (You)",
        avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Admin",
        message: comment,
        timestamp: new Date(),
        streamId,
        loves: 0,
        replyTo: replyingTo?.commentId === streamId.split('-')[0] ? replyingTo.userName : undefined,
      };
      
      setActiveStreams(activeStreams.map(s => 
        s.id === streamId ? { ...s, comments: [...s.comments, newComment] } : s
      ));
      setCommentInputs({ ...commentInputs, [streamId]: "" });
      setReplyingTo(null);
      
      // Scroll to bottom
      setTimeout(() => {
        commentEndRefs.current[streamId]?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  const handleLoveComment = (streamId: string, commentId: string) => {
    setActiveStreams(activeStreams.map(s => {
      if (s.id === streamId) {
        return {
          ...s,
          comments: s.comments.map(c => 
            c.id === commentId ? { ...c, loves: c.loves + 1 } : c
          ),
        };
      }
      return s;
    }));
  };

  const handleReplyToComment = (streamId: string, commentId: string, userName: string) => {
    setReplyingTo({ streamId, commentId, userName });
    setCommentInputs({ ...commentInputs, [streamId]: `@${userName} ` });
  };

  const getTotalViewers = () => activeStreams.reduce((sum, s) => sum + s.viewerCount, 0);
  const getTotalLikes = () => activeStreams.reduce((sum, s) => sum + s.likeCount, 0);
  const getAvailableCollaborators = () => availableCollaborators.filter(
    c => !activeStreams.find(s => s.collaborator.id === c.id)
  );

  // Simulate viewer count, likes, shares, and comments for active streams
  useEffect(() => {
    if (activeStreams.length === 0) return;

    // Simulate viewer count changes
    const viewerInterval = setInterval(() => {
      setActiveStreams(prev => prev.map(stream => ({
        ...stream,
        viewerCount: Math.max(1, stream.viewerCount + Math.floor(Math.random() * 10) - 3), // -3 to +6 viewers
      })));
    }, 8000);

    // Simulate likes and shares
    const engagementInterval = setInterval(() => {
      setActiveStreams(prev => prev.map(stream => ({
        ...stream,
        likeCount: stream.likeCount + Math.floor(Math.random() * 5),
        shareCount: stream.shareCount + (Math.random() > 0.7 ? 1 : 0),
      })));
    }, 10000);

    // Simulate user comments
    const commentInterval = setInterval(() => {
      const userNames = [
        "Jessica Brown", "Tom Wilson", "Amy Chen", "Chris Davis", 
        "Nicole Martinez", "James Anderson", "Sophie Taylor", "Ryan Moore",
        "Emily White", "Daniel Garcia", "Rachel Lee", "Kevin Rodriguez"
      ];

      const commentMessages = [
        "This product looks amazing! 😍",
        "How much is the shipping?",
        "Does it come in other colors?",
        "I just ordered one!",
        "Can you show it closer to the camera?",
        "Is there a discount code?",
        "This is exactly what I've been looking for!",
        "Added to cart! 🛒",
        "What's the return policy?",
        "Love your stream! ❤️",
        "When will it be back in stock?",
        "Great quality!",
        "How long is the delivery time?",
        "Do you ship internationally?",
        "This stream is so helpful!",
        "Can you demo how to use it?",
      ];

      setActiveStreams(prev => prev.map(stream => {
        // Randomly add comment to streams
        if (Math.random() > 0.4) {
          const randomUser = userNames[Math.floor(Math.random() * userNames.length)];
          const randomMessage = commentMessages[Math.floor(Math.random() * commentMessages.length)];
          
          const newComment: Comment = {
            id: `comment-${Date.now()}-${Math.random()}`,
            user: randomUser,
            avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${randomUser.replace(' ', '')}`,
            message: randomMessage,
            timestamp: new Date(),
            streamId: stream.id,
            loves: 0,
          };

          return {
            ...stream,
            comments: [...stream.comments, newComment].slice(-100), // Keep last 100 comments
          };
        }
        return stream;
      }));
    }, 5000);

    return () => {
      clearInterval(viewerInterval);
      clearInterval(engagementInterval);
      clearInterval(commentInterval);
    };
  }, [activeStreams.length]);

  // Auto-scroll comments to bottom when new comments arrive
  useEffect(() => {
    activeStreams.forEach(stream => {
      commentEndRefs.current[stream.id]?.scrollIntoView({ behavior: "smooth" });
    });
  }, [activeStreams.map(s => s.comments.length).join(',')]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Live Stream Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage multiple concurrent streams with different collaborators ({activeStreams.length}/3 active)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeStreams.length > 0 && (
            <div className="flex items-center gap-4 px-4 py-2 bg-slate-100 rounded-lg">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-red-500 animate-pulse" />
                <span className="text-sm font-medium text-red-600">{activeStreams.length} LIVE</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Eye className="w-4 h-4" />
                <span className="font-semibold">{getTotalViewers()}</span>
                <span className="text-slate-400">viewers</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Heart className="w-4 h-4 text-red-500" />
                <span className="font-semibold">{getTotalLikes()}</span>
                <span className="text-slate-400">loves</span>
              </div>
            </div>
          )}
          <Button 
            onClick={() => setShowCollaboratorSelector(!showCollaboratorSelector)}
            className="bg-purple-600 hover:bg-purple-700"
            disabled={activeStreams.length >= 3}
          >
            <Plus className="w-4 h-4 mr-2" />
            Start New Stream
          </Button>
        </div>
      </div>

      {/* Collaborator Selector Modal */}
      {showCollaboratorSelector && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">Select Collaborator for New Stream</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowCollaboratorSelector(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={collaboratorSearch}
                onChange={(e) => setCollaboratorSearch(e.target.value)}
                placeholder="Search collaborators..."
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {getAvailableCollaborators()
              .filter(c => c.name.toLowerCase().includes(collaboratorSearch.toLowerCase()))
              .map((collaborator) => (
              <button
                key={collaborator.id}
                onClick={() => handleStartStream(collaborator)}
                className="flex flex-col items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition-colors"
              >
                <img src={collaborator.avatar} alt={collaborator.name} className="w-16 h-16 rounded-full" />
                <div className="text-center">
                  <p className="font-medium">{collaborator.name}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    <span>{(collaborator.followers / 1000).toFixed(1)}K followers</span>
                    <span>~{collaborator.avgViewers} viewers</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {getAvailableCollaborators().filter(c => c.name.toLowerCase().includes(collaboratorSearch.toLowerCase())).length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <UserPlus className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No available collaborators found</p>
            </div>
          )}
        </div>
      )}

      {/* Active Streams */}
      {activeStreams.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Video className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No Active Streams</h3>
          <p className="text-slate-500 mb-6">Start broadcasting with a collaborator to engage your customers</p>
          <Button onClick={() => setShowCollaboratorSelector(true)} className="bg-purple-600 hover:bg-purple-700">
            <Plus className="w-4 h-4 mr-2" />
            Start Your First Stream
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {activeStreams.map((stream) => (
            <div key={stream.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-3 gap-0">
                {/* Left: Stream Preview + Products */}
                <div className="col-span-2 border-r border-slate-200">
                  {/* Stream Preview */}
                  <div className="bg-slate-900 aspect-video relative">
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-900 to-slate-900">
                      <div className="text-center">
                        <Video className="w-16 h-16 text-white mx-auto mb-3" />
                        <p className="text-white text-lg font-medium">{stream.collaborator.name}</p>
                        <p className="text-white/70 text-sm mt-1">Live Broadcasting</p>
                      </div>
                    </div>
                    
                    {/* Live Badge */}
                    <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1.5 rounded-full flex items-center gap-2 text-sm shadow-lg">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      <span className="font-semibold">LIVE</span>
                    </div>

                    {/* Stats Overlay */}
                    <div className="absolute top-4 right-4 flex gap-2">
                      <div className="bg-black/70 backdrop-blur-sm text-white px-3 py-1.5 rounded-full flex items-center gap-2 text-sm shadow-lg">
                        <Eye className="w-4 h-4" />
                        <span className="font-semibold">{stream.viewerCount}</span>
                      </div>
                      <div className="bg-black/70 backdrop-blur-sm text-white px-3 py-1.5 rounded-full flex items-center gap-2 text-sm shadow-lg">
                        <Heart className="w-4 h-4 text-red-400" />
                        <span className="font-semibold">{stream.likeCount}</span>
                      </div>
                    </div>

                    {/* Collaborator Info */}
                    <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 bg-black/70 backdrop-blur-sm rounded-lg p-3 shadow-lg">
                      <img src={stream.collaborator.avatar} alt={stream.collaborator.name} className="w-10 h-10 rounded-full border-2 border-white" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium">{stream.collaborator.name}</p>
                        <p className="text-white/80 text-sm">{stream.products.length} products • Started {stream.startTime?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  </div>

                  {/* Stream Controls */}
                  <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-2">
                      <Button
                        variant={stream.isCameraOn ? "default" : "destructive"}
                        size="sm"
                        onClick={() => handleToggleCamera(stream.id)}
                      >
                        {stream.isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant={stream.isMicOn ? "default" : "destructive"}
                        size="sm"
                        onClick={() => handleToggleMic(stream.id)}
                      >
                        {stream.isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                      </Button>
                      <div className="ml-3 text-sm text-slate-600">
                        <span className={stream.isCameraOn ? "text-green-600" : "text-red-600"}>Camera {stream.isCameraOn ? "On" : "Off"}</span>
                        <span className="mx-2">•</span>
                        <span className={stream.isMicOn ? "text-green-600" : "text-red-600"}>Mic {stream.isMicOn ? "On" : "Off"}</span>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleStopStream(stream.id)}
                    >
                      <X className="w-4 h-4 mr-2" />
                      End Stream
                    </Button>
                  </div>

                  {/* Products Section */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-purple-600" />
                        Products in Sale ({stream.products.length})
                      </h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowProductSelector(showProductSelector === stream.id ? null : stream.id)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Product
                      </Button>
                    </div>

                    {/* Product Selector */}
                    {showProductSelector === stream.id && (
                      <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="grid grid-cols-2 gap-2">
                          {availableProducts.filter(p => !stream.products.find(sp => sp.id === p.id)).map((product) => (
                            <button
                              key={product.id}
                              onClick={() => handleAddProduct(stream.id, product)}
                              className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition-colors"
                            >
                              <img src={product.image} alt={product.name} className="w-10 h-10 rounded object-cover" />
                              <div className="flex-1 text-left min-w-0">
                                <p className="text-xs font-medium truncate">{product.name}</p>
                                <p className="text-xs text-purple-600 font-semibold">${product.price}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Selected Products */}
                    {stream.products.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 bg-slate-50 rounded-lg">
                        <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No products added yet</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {stream.products.map((product) => (
                          <div key={product.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                            <img src={product.image} alt={product.name} className="w-12 h-12 rounded object-cover" />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium truncate">{product.name}</h4>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-sm font-semibold text-purple-600">${product.price}</span>
                                <span className="text-xs text-slate-500">Stock: {product.stock}</span>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveProduct(stream.id, product.id)}
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Comments & Interactions */}
                <div className="flex flex-col bg-slate-50">
                  <div className="p-4 border-b border-slate-200 bg-white">
                    <h3 className="font-semibold mb-2">Live Comments</h3>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-slate-600">{stream.comments.length} comments</span>
                      <div className="flex items-center gap-1.5 text-red-600">
                        <Heart className="w-4 h-4 fill-current" />
                        <span className="font-semibold">{stream.likeCount} loves</span>
                      </div>
                    </div>
                  </div>

                  {/* Comments Feed */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ height: "450px" }}>
                    {stream.comments.map((comment) => (
                      <div key={comment.id} className="flex gap-2 animate-in fade-in duration-300">
                        <img src={comment.avatar} alt={comment.user} className="w-8 h-8 rounded-full flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="bg-white rounded-lg p-2 border border-slate-200">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-slate-900">{comment.user}</span>
                              <span className="text-xs text-slate-400">
                                {new Date(comment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {comment.replyTo && (
                              <p className="text-xs text-purple-600 mb-1">Replying to @{comment.replyTo}</p>
                            )}
                            <p className="text-sm text-slate-700 mb-2">{comment.message}</p>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleLoveComment(stream.id, comment.id)}
                                className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 transition-colors"
                              >
                                <Heart className={`w-3.5 h-3.5 ${comment.loves > 0 ? 'fill-red-500 text-red-500' : ''}`} />
                                <span className="font-medium">{comment.loves > 0 ? comment.loves : 'Love'}</span>
                              </button>
                              <button
                                onClick={() => handleReplyToComment(stream.id, comment.id, comment.user)}
                                className="flex items-center gap-1 text-xs text-slate-500 hover:text-purple-600 transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span className="font-medium">Reply</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={(el) => { commentEndRefs.current[stream.id] = el; }} />
                  </div>

                  {/* Comment Input */}
                  <div className="p-4 border-t border-slate-200 bg-white">
                    {replyingTo && replyingTo.streamId === stream.id && (
                      <div className="mb-2 flex items-center justify-between px-3 py-2 bg-purple-50 rounded-lg text-sm">
                        <span className="text-purple-700">
                          <MessageCircle className="w-4 h-4 inline mr-1" />
                          Replying to <span className="font-semibold">{replyingTo.userName}</span>
                        </span>
                        <button
                          onClick={() => {
                            setReplyingTo(null);
                            setCommentInputs({ ...commentInputs, [stream.id]: "" });
                          }}
                          className="text-purple-600 hover:text-purple-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={commentInputs[stream.id] || ""}
                        onChange={(e) => setCommentInputs({ ...commentInputs, [stream.id]: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSendComment(stream.id);
                        }}
                        placeholder={replyingTo && replyingTo.streamId === stream.id ? `Reply to ${replyingTo.userName}...` : "Reply to viewers..."}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <Button 
                        onClick={() => handleSendComment(stream.id)} 
                        size="sm" 
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}