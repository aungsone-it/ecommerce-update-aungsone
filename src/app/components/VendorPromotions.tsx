import {
  Tag,
  Percent,
  DollarSign,
  Users,
  Edit,
  MoreVertical,
  BarChart3,
  Trash2,
  Copy,
  Eye,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface VendorPromotionsProps {
  vendor: {
    name: string;
    [key: string]: any;
  };
}

export function VendorPromotions({ vendor }: VendorPromotionsProps) {
  // Mock promotional campaigns data
  const mockCampaigns = [
    {
      id: "1",
      name: "Valentine's Day Sale",
      description: "Special discount for Valentine's Day celebration",
      startDate: "Feb 1, 2026",
      endDate: "Feb 14, 2026",
      status: "active" as const,
      discount: 15,
      targetProducts: "All Electronics",
      usage: 247,
      revenue: 12850
    },
    {
      id: "2",
      name: "New Year Clearance",
      description: "Clear out old inventory with special discounts",
      startDate: "Jan 1, 2026",
      endDate: "Jan 31, 2026",
      status: "ended" as const,
      discount: 20,
      targetProducts: "Selected Items",
      usage: 412,
      revenue: 18940
    },
    {
      id: "3",
      name: "Spring Launch 2026",
      description: "Upcoming promotion for new spring collection",
      startDate: "Mar 1, 2026",
      endDate: "Mar 31, 2026",
      status: "scheduled" as const,
      discount: 10,
      targetProducts: "New Arrivals",
      usage: 0,
      revenue: 0
    }
  ];

  // Mock coupon codes data
  const mockCoupons = [
    {
      id: "1",
      code: "VALENTINE15",
      discount: 15,
      type: "percentage" as const,
      minPurchase: 50,
      maxUses: 500,
      currentUses: 247,
      validFrom: "Feb 1, 2026",
      validUntil: "Feb 14, 2026",
      status: "active" as const,
      revenue: 12850
    },
    {
      id: "2",
      code: "NEWYEAR20",
      discount: 20,
      type: "percentage" as const,
      minPurchase: 100,
      maxUses: 1000,
      currentUses: 412,
      validFrom: "Jan 1, 2026",
      validUntil: "Jan 31, 2026",
      status: "expired" as const,
      revenue: 18940
    },
    {
      id: "3",
      code: "FREESHIP",
      discount: 0,
      type: "free_shipping" as const,
      minPurchase: 30,
      maxUses: 300,
      currentUses: 156,
      validFrom: "Jan 15, 2026",
      validUntil: "Mar 31, 2026",
      status: "active" as const,
      revenue: 4680
    },
    {
      id: "4",
      code: "WELCOME10",
      discount: 10,
      type: "fixed" as const,
      minPurchase: 50,
      maxUses: 200,
      currentUses: 89,
      validFrom: "Jan 1, 2026",
      validUntil: "Dec 31, 2026",
      status: "active" as const,
      revenue: 2340
    },
    {
      id: "5",
      code: "SPRING2026",
      discount: 10,
      type: "percentage" as const,
      minPurchase: 75,
      maxUses: 400,
      currentUses: 0,
      validFrom: "Mar 1, 2026",
      validUntil: "Mar 31, 2026",
      status: "scheduled" as const,
      revenue: 0
    }
  ];

  const getCouponStatusBadge = (status: string) => {
    const variants = {
      active: { color: "bg-green-100 text-green-700 border-green-200", label: "Active" },
      expired: { color: "bg-red-100 text-red-700 border-red-200", label: "Expired" },
      scheduled: { color: "bg-blue-100 text-blue-700 border-blue-200", label: "Scheduled" },
    };
    const variant = variants[status as keyof typeof variants];
    return (
      <Badge className={`${variant.color} border text-xs`}>
        {variant.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Campaign Statistics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Active Campaigns</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">
                {mockCampaigns.filter(c => c.status === 'active').length}
              </p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Tag className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Active Coupons</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">
                {mockCoupons.filter(c => c.status === 'active').length}
              </p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Percent className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Usage</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">
                {mockCoupons.reduce((sum, c) => sum + c.currentUses, 0)}
              </p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Promo Revenue</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">
                ${mockCoupons.reduce((sum, c) => sum + c.revenue, 0).toLocaleString()}
              </p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-orange-600" />
            </div>
          </div>
        </Card>
      </div>

      <Separator />

      {/* Promotional Campaigns */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Promotional Campaigns</h3>
          <Button size="sm">
            <Tag className="w-4 h-4 mr-2" />
            Create Campaign
          </Button>
        </div>
        <div className="space-y-3">
          {mockCampaigns.map((campaign) => (
            <Card key={campaign.id} className="p-5 border border-slate-200">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold text-slate-900">{campaign.name}</h4>
                    <Badge className={
                      campaign.status === 'active' ? 'bg-green-100 text-green-700 border-green-200 border' :
                      campaign.status === 'scheduled' ? 'bg-blue-100 text-blue-700 border-blue-200 border' :
                      'bg-gray-100 text-gray-700 border-gray-200 border'
                    }>
                      {campaign.status === 'active' ? 'Active' : campaign.status === 'scheduled' ? 'Scheduled' : 'Ended'}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600 mb-3">{campaign.description}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-slate-500">Discount</p>
                      <p className="font-semibold text-slate-900">{campaign.discount}% OFF</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Target</p>
                      <p className="font-semibold text-slate-900">{campaign.targetProducts}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Duration</p>
                      <p className="text-sm font-semibold text-slate-900">{campaign.startDate} - {campaign.endDate}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Performance</p>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{campaign.usage} uses</p>
                        {campaign.revenue > 0 && <p className="text-sm text-green-600">${campaign.revenue.toLocaleString()}</p>}
                      </div>
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Campaign
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <BarChart3 className="w-4 h-4 mr-2" />
                      View Analytics
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600">
                      <Trash2 className="w-4 h-4 mr-2" />
                      End Campaign
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Separator />

      {/* Coupon Codes */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Coupon Codes</h3>
          <Button size="sm">
            <Percent className="w-4 h-4 mr-2" />
            Create Coupon
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left p-3 text-sm font-medium text-slate-600">Code</th>
                <th className="text-left p-3 text-sm font-medium text-slate-600">Type</th>
                <th className="text-left p-3 text-sm font-medium text-slate-600">Discount</th>
                <th className="text-left p-3 text-sm font-medium text-slate-600">Min Purchase</th>
                <th className="text-left p-3 text-sm font-medium text-slate-600">Usage</th>
                <th className="text-left p-3 text-sm font-medium text-slate-600">Valid Period</th>
                <th className="text-left p-3 text-sm font-medium text-slate-600">Revenue</th>
                <th className="text-left p-3 text-sm font-medium text-slate-600">Status</th>
                <th className="text-left p-3 text-sm font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mockCoupons.map((coupon) => {
                const usagePercentage = (coupon.currentUses / coupon.maxUses) * 100;

                return (
                  <tr key={coupon.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-semibold text-slate-900">{coupon.code}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">
                        {coupon.type === 'percentage' ? 'Percentage' : coupon.type === 'fixed' ? 'Fixed' : 'Free Shipping'}
                      </Badge>
                    </td>
                    <td className="p-3 text-sm font-semibold text-slate-900">
                      {coupon.type === 'percentage' && `${coupon.discount}%`}
                      {coupon.type === 'fixed' && `${coupon.discount} MMK`}
                      {coupon.type === 'free_shipping' && 'Free Ship'}
                    </td>
                    <td className="p-3 text-sm text-slate-600">{coupon.minPurchase} MMK</td>
                    <td className="p-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{coupon.currentUses}/{coupon.maxUses}</span>
                          <span className="text-xs text-slate-500">({usagePercentage.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              usagePercentage >= 80 ? 'bg-orange-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${usagePercentage}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="text-xs text-slate-600">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {coupon.validFrom}
                        </div>
                        <div className="text-slate-500 mt-0.5">to {coupon.validUntil}</div>
                      </div>
                    </td>
                    <td className="p-3 text-sm font-semibold text-green-600">
                      {coupon.revenue.toLocaleString()} MMK
                    </td>
                    <td className="p-3">{getCouponStatusBadge(coupon.status)}</td>
                    <td className="p-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Coupon
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Deactivate
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Coupon Validation Stats */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Coupon Validation Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 border border-slate-200 bg-gradient-to-br from-green-50 to-green-100/50">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <Badge className="bg-green-600 text-white border-0">Valid</Badge>
            </div>
            <p className="text-2xl font-bold text-green-900 mb-1">
              {mockCoupons.filter(c => c.status === 'active').length} codes
            </p>
            <p className="text-sm text-green-700">Currently active and valid</p>
          </Card>

          <Card className="p-5 border border-slate-200 bg-gradient-to-br from-red-50 to-red-100/50">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <Badge className="bg-red-600 text-white border-0">Expired</Badge>
            </div>
            <p className="text-2xl font-bold text-red-900 mb-1">
              {mockCoupons.filter(c => c.status === 'expired').length} codes
            </p>
            <p className="text-sm text-red-700">Past expiration date</p>
          </Card>

          <Card className="p-5 border border-slate-200 bg-gradient-to-br from-blue-50 to-blue-100/50">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <Badge className="bg-blue-600 text-white border-0">Scheduled</Badge>
            </div>
            <p className="text-2xl font-bold text-blue-900 mb-1">
              {mockCoupons.filter(c => c.status === 'scheduled').length} codes
            </p>
            <p className="text-sm text-blue-700">Awaiting start date</p>
          </Card>
        </div>
      </div>
    </div>
  );
}