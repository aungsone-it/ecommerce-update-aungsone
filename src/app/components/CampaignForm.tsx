import { useState } from "react";
import { X, Bell, Tag, Gift, Percent, Calendar, Users, Target, Megaphone, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

type CampaignType = "push-notification" | "coupon" | "seasonal" | "discount-code";

interface CampaignFormProps {
  mode: "add" | "edit";
  initialData?: any;
  onSave?: (data: any) => void;
  onCancel?: () => void;
}

export function CampaignForm({ mode, initialData, onSave, onCancel }: CampaignFormProps) {
  const [name, setName] = useState(initialData?.name || "");
  const [type, setType] = useState<CampaignType>(initialData?.type || "coupon");
  const [startDate, setStartDate] = useState(initialData?.startDate || "");
  const [endDate, setEndDate] = useState(initialData?.endDate || "");
  const [code, setCode] = useState(initialData?.code || "");
  const [discount, setDiscount] = useState(initialData?.discount || 10);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(initialData?.discountType || "percentage");
  const [title, setTitle] = useState(initialData?.title || "");
  const [message, setMessage] = useState(initialData?.message || "");
  const [targetAudience, setTargetAudience] = useState(initialData?.targetAudience || "All Customers");
  const [usageLimit, setUsageLimit] = useState(initialData?.usageLimit || 1000);
  const [minQuantity, setMinQuantity] = useState(initialData?.minQuantity || 1);
  const [minAmount, setMinAmount] = useState(initialData?.minAmount || 0);

  const handleSave = () => {
    const data = {
      name,
      type,
      startDate,
      endDate,
      code: type !== "push-notification" ? code : undefined,
      discount: type !== "push-notification" ? discount : undefined,
      discountType: type !== "push-notification" ? discountType : undefined,
      title: type === "push-notification" ? title : undefined,
      message: type === "push-notification" ? message : undefined,
      targetAudience,
      usageLimit,
      minQuantity: type !== "push-notification" ? minQuantity : undefined,
      minAmount: type !== "push-notification" ? minAmount : undefined,
    };
    onSave?.(data);
  };

  const handleSaveDraft = () => {
    const data = {
      name,
      type,
      startDate,
      endDate,
      status: "draft",
    };
    onSave?.(data);
  };

  const getTypeIcon = () => {
    const icons = {
      "push-notification": Bell,
      "coupon": Tag,
      "seasonal": Gift,
      "discount-code": Percent,
    };
    return icons[type];
  };

  const TypeIcon = getTypeIcon();

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                {mode === "edit" ? "Edit Campaign" : "Create Campaign"}
              </h1>
              <p className="text-sm text-slate-500">Set up a new marketing campaign</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSaveDraft}>
              Save as Draft
            </Button>
            <Button onClick={handleSave} className="bg-slate-900 hover:bg-slate-800">
              {mode === "edit" ? "Save Changes" : "Create Campaign"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
          {/* Main Content - Left Side */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="w-5 h-5 text-purple-600" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="campaign-name">Campaign Name *</Label>
                  <Input
                    id="campaign-name"
                    placeholder="e.g., Summer Sale 2026"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Give your campaign a descriptive name for internal reference
                  </p>
                </div>

                <div>
                  <Label htmlFor="campaign-type">Campaign Type *</Label>
                  <Select value={type} onValueChange={(value) => setType(value as CampaignType)}>
                    <SelectTrigger id="campaign-type" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="push-notification">
                        <div className="flex items-center gap-2">
                          <Bell className="w-4 h-4" />
                          Push Notification
                        </div>
                      </SelectItem>
                      <SelectItem value="coupon">
                        <div className="flex items-center gap-2">
                          <Tag className="w-4 h-4" />
                          Coupon
                        </div>
                      </SelectItem>
                      <SelectItem value="seasonal">
                        <div className="flex items-center gap-2">
                          <Gift className="w-4 h-4" />
                          Seasonal Discount
                        </div>
                      </SelectItem>
                      <SelectItem value="discount-code">
                        <div className="flex items-center gap-2">
                          <Percent className="w-4 h-4" />
                          Discount Code
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="target-audience">Target Audience *</Label>
                  <Select value={targetAudience} onValueChange={setTargetAudience}>
                    <SelectTrigger id="target-audience" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All Customers">All Customers</SelectItem>
                      <SelectItem value="New Customers">New Customers</SelectItem>
                      <SelectItem value="VIP Customers">VIP Customers</SelectItem>
                      <SelectItem value="Email Subscribers">Email Subscribers</SelectItem>
                      <SelectItem value="Cart Abandoners">Cart Abandoners</SelectItem>
                      <SelectItem value="Wishlist Users">Wishlist Users</SelectItem>
                      <SelectItem value="Gaming Enthusiasts">Gaming Enthusiasts</SelectItem>
                      <SelectItem value="Fashion Lovers">Fashion Lovers</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">
                    Select which customer segment will receive this campaign
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Push Notification Content */}
            {type === "push-notification" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-blue-600" />
                    Notification Content
                  </CardTitle>
                  <CardDescription>
                    Create engaging notification messages to reach your customers
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="notification-title">Notification Title *</Label>
                    <Input
                      id="notification-title"
                      placeholder="e.g., Flash Sale Alert! 🔥"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="mt-2"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Keep it short and attention-grabbing (max 50 characters)
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="notification-message">Message *</Label>
                    <Textarea
                      id="notification-message"
                      placeholder="Write your notification message..."
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="mt-2"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Provide clear details about your offer or announcement
                    </p>
                  </div>

                  {/* Preview */}
                  <div className="mt-4 p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg border border-blue-200">
                    <p className="text-xs font-medium text-blue-900 mb-2">Preview</p>
                    <div className="bg-white rounded-lg p-3 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Bell className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900 text-sm">
                            {title || "Notification Title"}
                          </p>
                          <p className="text-xs text-slate-600 mt-1">
                            {message || "Your notification message will appear here..."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Discount Details */}
            {(type === "coupon" || type === "seasonal" || type === "discount-code") && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Percent className="w-5 h-5 text-green-600" />
                    Discount Details
                  </CardTitle>
                  <CardDescription>
                    Set up your discount code and savings amount
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="coupon-code">Coupon Code *</Label>
                    <Input
                      id="coupon-code"
                      placeholder="e.g., SUMMER2026"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      className="mt-2 font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Use uppercase letters and numbers (no spaces)
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="discount-amount">Discount Amount *</Label>
                      <Input
                        id="discount-amount"
                        type="number"
                        placeholder="10"
                        value={discount}
                        onChange={(e) => setDiscount(parseInt(e.target.value) || 0)}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="discount-type">Discount Type *</Label>
                      <Select value={discountType} onValueChange={(value) => setDiscountType(value as "percentage" | "fixed")}>
                        <SelectTrigger id="discount-type" className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage (%)</SelectItem>
                          <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Discount Preview */}
                  <div className="mt-4 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-green-900 mb-1">Discount Preview</p>
                        <code className="text-lg font-bold font-mono text-purple-600">
                          {code || "CODE123"}
                        </code>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-green-600">
                          {discountType === "percentage" ? `${discount}%` : `$${discount}`}
                        </p>
                        <p className="text-xs text-green-700">
                          {discountType === "percentage" ? "OFF" : "DISCOUNT"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Minimum Requirements */}
                  <div>
                    <Label className="text-sm font-semibold text-slate-900">
                      Minimum Purchase Requirements (Optional)
                    </Label>
                    <p className="text-xs text-slate-500 mt-1 mb-3">
                      Set requirements customers must meet to use this discount
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="min-quantity" className="text-xs">Minimum Quantity</Label>
                        <Input
                          id="min-quantity"
                          type="number"
                          placeholder="1"
                          min="1"
                          value={minQuantity}
                          onChange={(e) => setMinQuantity(parseInt(e.target.value) || 1)}
                          className="mt-2"
                        />
                        <p className="text-xs text-slate-500 mt-1">Min items in cart</p>
                      </div>
                      <div>
                        <Label htmlFor="min-amount" className="text-xs">Minimum Amount ($)</Label>
                        <Input
                          id="min-amount"
                          type="number"
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          value={minAmount}
                          onChange={(e) => setMinAmount(parseFloat(e.target.value) || 0)}
                          className="mt-2"
                        />
                        <p className="text-xs text-slate-500 mt-1">Min cart value</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Schedule & Limits */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-amber-600" />
                  Schedule & Limits
                </CardTitle>
                <CardDescription>
                  Define when and how often this campaign can be used
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="start-date">Start Date *</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="end-date">End Date *</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="usage-limit">Usage Limit *</Label>
                  <Input
                    id="usage-limit"
                    type="number"
                    placeholder="1000"
                    value={usageLimit}
                    onChange={(e) => setUsageLimit(parseInt(e.target.value) || 1000)}
                    className="mt-2"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Maximum number of times this campaign can be used (total across all customers)
                  </p>
                </div>

                {/* Date Range Preview */}
                {startDate && endDate && (
                  <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-amber-600" />
                      <span className="font-medium text-amber-900">
                        Campaign runs from {new Date(startDate).toLocaleDateString()} to {new Date(endDate).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-amber-700 mt-1">
                      Duration: {Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))} days
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Campaign Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Campaign Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-600">Type</span>
                    <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                      {type === "push-notification" && "Push Notification"}
                      {type === "coupon" && "Coupon"}
                      {type === "seasonal" && "Seasonal"}
                      {type === "discount-code" && "Discount Code"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-600">Audience</span>
                    <span className="text-sm font-medium text-slate-900">{targetAudience}</span>
                  </div>
                  {startDate && endDate && (
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-600">Duration</span>
                      <span className="text-sm font-medium text-slate-900">
                        {Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))} days
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Campaign Preview Card */}
            <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  Campaign Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Campaign Name</p>
                  <p className="font-semibold text-slate-900">{name || "Untitled Campaign"}</p>
                </div>
                {type !== "push-notification" && code && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Code</p>
                    <code className="text-sm font-mono font-bold text-purple-600">{code}</code>
                  </div>
                )}
                {type !== "push-notification" && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Discount</p>
                    <p className="text-xl font-bold text-green-600">
                      {discountType === "percentage" ? `${discount}% OFF` : `$${discount} OFF`}
                    </p>
                  </div>
                )}
                {type === "push-notification" && title && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Title</p>
                    <p className="font-medium text-slate-900">{title}</p>
                  </div>
                )}
                <Separator />
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Target className="w-3 h-3" />
                  <span>{targetAudience}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Users className="w-3 h-3" />
                  <span>Limit: {usageLimit.toLocaleString()} uses</span>
                </div>
              </CardContent>
            </Card>

            {/* Tips */}
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2 text-blue-900">
                  <TrendingUp className="w-4 h-4" />
                  Campaign Tips
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-xs text-blue-800">
                  <li className="flex gap-2">
                    <span>•</span>
                    <span>Use clear, action-oriented language in your campaign name</span>
                  </li>
                  <li className="flex gap-2">
                    <span>•</span>
                    <span>Test your campaign with a small audience first</span>
                  </li>
                  <li className="flex gap-2">
                    <span>•</span>
                    <span>Create urgency with limited-time offers</span>
                  </li>
                  <li className="flex gap-2">
                    <span>•</span>
                    <span>Track performance metrics regularly</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
