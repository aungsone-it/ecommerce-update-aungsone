import { useState } from "react";
import { Button } from "./ui/button";
import { Video, VideoOff, Mic, MicOff, MonitorPlay, X, Plus, Eye, Heart, Share2, ShoppingBag, Send, MoreVertical, Trash2 } from "lucide-react";

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
  isGift?: boolean;
}

export function LiveStream() {
  const [isLive, setIsLive] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [shareCount, setShareCount] = useState(0);
  const [comment, setComment] = useState("");
  const [showProductSelector, setShowProductSelector] = useState(false);

  // Mock data for available products
  const [availableProducts] = useState<Product[]>([
    { id: "1", name: "Wireless Headphones", price: 79.99, image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200&h=200&fit=crop", stock: 45 },
    { id: "2", name: "Smart Watch", price: 199.99, image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&h=200&fit=crop", stock: 23 },
    { id: "3", name: "Laptop Stand", price: 49.99, image: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=200&h=200&fit=crop", stock: 67 },
    { id: "4", name: "Mechanical Keyboard", price: 129.99, image: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=200&h=200&fit=crop", stock: 34 },
    { id: "5", name: "Wireless Mouse", price: 39.99, image: "https://images.unsplash.com/photo-1527814050087-3793815479db?w=200&h=200&fit=crop", stock: 89 },
  ]);

  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);

  const [comments, setComments] = useState<Comment[]>([
    { id: "1", user: "Sarah Chen", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Sarah", message: "Love this product! 😍", timestamp: new Date(Date.now() - 120000) },
    { id: "2", user: "Mike Johnson", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Mike", message: "How much is the wireless headphones?", timestamp: new Date(Date.now() - 90000) },
    { id: "3", user: "Emma Wilson", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Emma", message: "Can you show the black color?", timestamp: new Date(Date.now() - 60000) },
    { id: "4", user: "David Lee", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=David", message: "Added to cart! 🛒", timestamp: new Date(Date.now() - 30000) },
  ]);

  const handleStartStream = () => {
    setIsLive(true);
    setViewerCount(1);
    // Simulate viewer count increase
    const interval = setInterval(() => {
      setViewerCount(prev => prev + Math.floor(Math.random() * 5));
    }, 5000);
    return () => clearInterval(interval);
  };

  const handleStopStream = () => {
    setIsLive(false);
    setViewerCount(0);
  };

  const handleAddProduct = (product: Product) => {
    if (!selectedProducts.find(p => p.id === product.id)) {
      setSelectedProducts([...selectedProducts, product]);
    }
    setShowProductSelector(false);
  };

  const handleRemoveProduct = (productId: string) => {
    setSelectedProducts(selectedProducts.filter(p => p.id !== productId));
  };

  const handleSendComment = () => {
    if (comment.trim()) {
      const newComment: Comment = {
        id: Date.now().toString(),
        user: "Admin (You)",
        avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Admin",
        message: comment,
        timestamp: new Date(),
      };
      setComments([...comments, newComment]);
      setComment("");
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Live Stream</h1>
          <p className="text-sm text-slate-500 mt-1">Broadcast products and interact with customers in real-time</p>
        </div>
        <div className="flex items-center gap-3">
          {isLive && (
            <div className="flex items-center gap-4 px-4 py-2 bg-slate-100 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-red-600">LIVE</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Eye className="w-4 h-4" />
                <span className="font-semibold">{viewerCount}</span>
              </div>
            </div>
          )}
          {!isLive ? (
            <Button onClick={handleStartStream} className="bg-purple-600 hover:bg-purple-700">
              <Video className="w-4 h-4 mr-2" />
              Start Broadcasting
            </Button>
          ) : (
            <Button onClick={handleStopStream} variant="destructive">
              <VideoOff className="w-4 h-4 mr-2" />
              End Stream
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Column - Stream Preview & Controls */}
        <div className="col-span-2 space-y-4">
          {/* Stream Preview */}
          <div className="bg-slate-900 rounded-xl overflow-hidden aspect-video relative">
            {!isLive ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <MonitorPlay className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">Stream preview will appear here</p>
                  <p className="text-sm text-slate-500 mt-2">Click "Start Broadcasting" to go live</p>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-900 to-slate-900">
                <div className="text-center">
                  <Video className="w-16 h-16 text-white mx-auto mb-4" />
                  <p className="text-white">Camera Feed Active</p>
                  <p className="text-sm text-slate-300 mt-2">Broadcasting to {viewerCount} viewers</p>
                </div>
              </div>
            )}
            
            {/* Live Badge */}
            {isLive && (
              <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-sm font-semibold">LIVE</span>
              </div>
            )}

            {/* Stats Overlay */}
            {isLive && (
              <div className="absolute top-4 right-4 flex gap-2">
                <div className="bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-full flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  <span className="text-sm font-semibold">{viewerCount}</span>
                </div>
                <div className="bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-full flex items-center gap-2">
                  <Heart className="w-4 h-4" />
                  <span className="text-sm font-semibold">{likeCount}</span>
                </div>
                <div className="bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-full flex items-center gap-2">
                  <Share2 className="w-4 h-4" />
                  <span className="text-sm font-semibold">{shareCount}</span>
                </div>
              </div>
            )}
          </div>

          {/* Stream Controls */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant={isCameraOn ? "default" : "destructive"}
                  size="sm"
                  onClick={() => setIsCameraOn(!isCameraOn)}
                  disabled={!isLive}
                >
                  {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </Button>
                <Button
                  variant={isMicOn ? "default" : "destructive"}
                  size="sm"
                  onClick={() => setIsMicOn(!isMicOn)}
                  disabled={!isLive}
                >
                  {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </Button>
                <div className="h-6 w-px bg-slate-200" />
                <span className="text-sm text-slate-600">
                  Camera: <span className={isCameraOn ? "text-green-600" : "text-red-600"}>{isCameraOn ? "On" : "Off"}</span>
                </span>
                <span className="text-sm text-slate-600">
                  Mic: <span className={isMicOn ? "text-green-600" : "text-red-600"}>{isMicOn ? "On" : "Off"}</span>
                </span>
              </div>
              <div className="text-sm text-slate-500">
                Stream Quality: <span className="font-medium text-slate-700">1080p HD</span>
              </div>
            </div>
          </div>

          {/* Products in Live Sale */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-purple-600" />
                Products in Live Sale
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowProductSelector(!showProductSelector)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            </div>

            {/* Product Selector Dropdown */}
            {showProductSelector && (
              <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Select a product to add</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowProductSelector(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {availableProducts.filter(p => !selectedProducts.find(sp => sp.id === p.id)).map((product) => (
                    <button
                      key={product.id}
                      onClick={() => handleAddProduct(product)}
                      className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition-colors"
                    >
                      <img src={product.image} alt={product.name} className="w-12 h-12 rounded object-cover" />
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium truncate">{product.name}</p>
                        <p className="text-sm text-purple-600 font-semibold">${product.price}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Products */}
            {selectedProducts.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <ShoppingBag className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No products added yet</p>
                <p className="text-xs mt-1">Add products to showcase during your live stream</p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedProducts.map((product) => (
                  <div key={product.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <img src={product.image} alt={product.name} className="w-16 h-16 rounded object-cover" />
                    <div className="flex-1">
                      <h4 className="font-medium">{product.name}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-lg font-semibold text-purple-600">${product.price}</span>
                        <span className="text-sm text-slate-500">Stock: {product.stock}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveProduct(product.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Live Comments & Interactions */}
        <div className="space-y-4">
          {/* Live Stats */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold mb-4">Live Statistics</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Viewers
                </span>
                <span className="font-semibold text-lg">{viewerCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 flex items-center gap-2">
                  <Heart className="w-4 h-4" />
                  Likes
                </span>
                <span className="font-semibold text-lg">{likeCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 flex items-center gap-2">
                  <Share2 className="w-4 h-4" />
                  Shares
                </span>
                <span className="font-semibold text-lg">{shareCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4" />
                  Products
                </span>
                <span className="font-semibold text-lg">{selectedProducts.length}</span>
              </div>
            </div>
          </div>

          {/* Live Comments */}
          <div className="bg-white rounded-xl border border-slate-200 flex flex-col" style={{ height: "calc(100vh - 450px)" }}>
            <div className="p-4 border-b border-slate-200">
              <h3 className="font-semibold">Live Comments</h3>
              <p className="text-xs text-slate-500 mt-1">{comments.length} comments</p>
            </div>

            {/* Comments Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-2">
                  <img src={comment.avatar} alt={comment.user} className="w-8 h-8 rounded-full flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{comment.user}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(comment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 mt-0.5">{comment.message}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Comment Input */}
            <div className="p-4 border-t border-slate-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendComment();
                  }}
                  placeholder="Reply to viewers..."
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <Button onClick={handleSendComment} size="sm" className="bg-purple-600 hover:bg-purple-700">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}