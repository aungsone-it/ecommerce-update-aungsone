import { useMemo, useState } from "react";
import {
  MapPin,
  Truck,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Clock,
  Globe,
  Wallet,
} from "lucide-react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
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
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface DeliveryService {
  id: string;
  name: string;
  logo: string;
  regions: string[];
  estimatedDays: string;
  cost: string;
  status: "active" | "inactive";
  codSupported: boolean;
  codFee?: string;
}

const deliveryServices: DeliveryService[] = [
  {
    id: "1",
    name: "FedEx Express",
    logo: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=100&h=100&fit=crop",
    regions: ["North America", "Europe", "Asia Pacific"],
    estimatedDays: "2-3 days",
    cost: "$25.99",
    status: "active",
    codSupported: true,
    codFee: "$5.00",
  },
  {
    id: "2",
    name: "DHL International",
    logo: "https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?w=100&h=100&fit=crop",
    regions: ["Europe", "Middle East", "Africa", "Asia Pacific"],
    estimatedDays: "3-5 days",
    cost: "$22.50",
    status: "active",
    codSupported: false,
  },
  {
    id: "3",
    name: "UPS Worldwide",
    logo: "https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=100&h=100&fit=crop",
    regions: ["North America", "South America", "Europe"],
    estimatedDays: "3-4 days",
    cost: "$24.00",
    status: "active",
    codSupported: true,
    codFee: "$3.00",
  },
  {
    id: "4",
    name: "Amazon Logistics",
    logo: "https://images.unsplash.com/photo-1523474253046-8cd2748b5fd2?w=100&h=100&fit=crop",
    regions: ["North America", "Europe", "Asia Pacific"],
    estimatedDays: "1-2 days",
    cost: "$18.99",
    status: "active",
    codSupported: true,
    codFee: "$2.00",
  },
  {
    id: "5",
    name: "Local Courier Service",
    logo: "https://images.unsplash.com/photo-1494412519320-aa613dfb7738?w=100&h=100&fit=crop",
    regions: ["Central America"],
    estimatedDays: "1 day",
    cost: "$12.00",
    status: "active",
    codSupported: false,
  },
  {
    id: "6",
    name: "Singapore Post",
    logo: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=100&h=100&fit=crop",
    regions: ["Asia Pacific"],
    estimatedDays: "5-7 days",
    cost: "$15.50",
    status: "active",
    codSupported: true,
    codFee: "$4.00",
  },
];

const regions = [
  "North America",
  "South America",
  "Central America",
  "Europe",
  "UK",
  "Middle East",
  "Africa",
  "Asia Pacific",
  "Japan",
];

export function Logistics() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [isAddServiceOpen, setIsAddServiceOpen] = useState(false);

  const filteredServices = useMemo(() => {
    return deliveryServices.filter((service) => {
      const matchesSearch = service.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesRegion =
        selectedRegion === "all" || service.regions.includes(selectedRegion);
      return matchesSearch && matchesRegion;
    });
  }, [searchQuery, selectedRegion]);

  const uniqueRegionsCovered = useMemo(() => {
    const set = new Set<string>();
    deliveryServices.forEach((s) => s.regions.forEach((r) => set.add(r)));
    return set.size;
  }, []);

  const totalPartners = deliveryServices.length;
  const activePartners = deliveryServices.filter((s) => s.status === "active").length;
  const codEnabledPartners = deliveryServices.filter((s) => s.codSupported).length;

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Logistics</h1>
          <p className="text-slate-500 mt-1 max-w-[42rem]">
            Manage delivery partners and carriers — add multiple shipping companies, coverage regions,
            rates, and cash-on-delivery options.
          </p>
        </div>
        <Button
          className="bg-slate-900 hover:bg-slate-800 shrink-0"
          onClick={() => setIsAddServiceOpen(true)}
        >
          <Truck className="w-4 h-4 mr-2" />
          Add delivery partner
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Delivery partners</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{totalPartners}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Truck className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Active carriers</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{activePartners}</p>
                <p className="text-xs text-slate-500 mt-1">of {totalPartners} configured</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Truck className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">COD-enabled</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{codEnabledPartners}</p>
                <p className="text-xs text-slate-500 mt-1">partners offer cash on delivery</p>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <Wallet className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Regions covered</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{uniqueRegionsCovered}</p>
                <p className="text-xs text-slate-500 mt-1">unique regions across partners</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Globe className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex gap-4 flex-col sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search delivery partners by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Filter by region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All regions</SelectItem>
                {regions.map((region) => (
                  <SelectItem key={region} value={region}>
                    {region}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            {filteredServices.map((service) => (
              <div
                key={service.id}
                className="border border-slate-200 rounded-lg p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <img
                      src={service.logo}
                      alt=""
                      className="w-16 h-16 rounded-lg border-2 border-slate-200 object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <h3 className="font-semibold text-slate-900">{service.name}</h3>
                        <Badge
                          variant="secondary"
                          className={
                            service.status === "active"
                              ? "bg-green-100 text-green-700 border-green-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }
                        >
                          {service.status}
                        </Badge>
                        {service.codSupported && (
                          <Badge
                            variant="secondary"
                            className="bg-amber-100 text-amber-700 border-amber-200"
                          >
                            COD available
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                        <div>
                          <p className="text-xs text-slate-500">Estimated delivery</p>
                          <p className="text-sm font-medium text-slate-900 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3 shrink-0" />
                            {service.estimatedDays}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Starting cost</p>
                          <p className="text-sm font-medium text-slate-900 mt-1">{service.cost}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Coverage</p>
                          <p className="text-sm font-medium text-slate-900 mt-1">
                            {service.regions.length} regions
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Cash on delivery</p>
                          {service.codSupported ? (
                            <p className="text-sm font-medium text-green-600 mt-1">
                              Yes {service.codFee && `(+${service.codFee})`}
                            </p>
                          ) : (
                            <p className="text-sm font-medium text-slate-400 mt-1">Not available</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500 mb-2">Available regions</p>
                        <div className="flex flex-wrap gap-2">
                          {service.regions.map((region) => (
                            <Badge
                              key={region}
                              variant="outline"
                              className="bg-purple-50 text-purple-700 border-purple-200"
                            >
                              <MapPin className="w-3 h-3 mr-1" />
                              {region}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="shrink-0">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isAddServiceOpen} onOpenChange={setIsAddServiceOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add delivery partner</DialogTitle>
            <DialogDescription>
              Register a carrier or shipping company customers can choose at checkout.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="serviceName">Company / service name</Label>
                <Input
                  id="serviceName"
                  placeholder="FedEx, DHL, local courier…"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="estimatedDays">Estimated delivery</Label>
                <Input id="estimatedDays" placeholder="2–3 days" className="mt-2" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cost">Starting cost</Label>
                <Input id="cost" placeholder="$25.99" className="mt-2" />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select defaultValue="active">
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg p-4 bg-amber-50">
              <div className="flex items-start gap-3">
                <input type="checkbox" id="codSupported" className="mt-1 rounded" />
                <div className="flex-1">
                  <Label htmlFor="codSupported" className="cursor-pointer font-semibold">
                    Cash on delivery (COD)
                  </Label>
                  <p className="text-sm text-slate-600 mt-1">
                    Allow COD for orders shipped with this partner.
                  </p>
                  <div className="mt-3">
                    <Label htmlFor="codFee" className="text-xs">
                      COD fee (optional)
                    </Label>
                    <Input id="codFee" placeholder="$5.00" className="mt-1 max-w-xs" />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Label>Regions served (select multiple)</Label>
              <div className="grid grid-cols-3 gap-2 mt-2 max-h-48 overflow-y-auto">
                {regions.map((region) => (
                  <label
                    key={region}
                    className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-slate-50"
                  >
                    <input type="checkbox" className="rounded" />
                    <span className="text-sm">{region}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddServiceOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => setIsAddServiceOpen(false)}>
              Add partner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
