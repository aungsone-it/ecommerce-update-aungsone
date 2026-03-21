import { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { 
  Warehouse, 
  MapPin, 
  Truck, 
  Users, 
  Package, 
  Plus, 
  Search, 
  MoreVertical, 
  Edit, 
  Trash2, 
  Eye,
  Building2,
  Mail,
  Phone,
  Clock,
  Box
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
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
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Separator } from "./ui/separator";

interface WarehouseMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  role: string;
  assignedRegions: string[];
  status: "active" | "inactive";
  joinDate: string;
}

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

interface WarehouseLocation {
  id: string;
  name: string;
  address: string;
  city: string;
  region: string;
  country: string;
  manager: string;
  capacity: number;
  currentStock: number;
  members: number;
  status: "active" | "inactive";
}

const warehouseMembers: WarehouseMember[] = [
  {
    id: "1",
    name: "James Wilson",
    email: "james.wilson@company.com",
    phone: "+1 (555) 123-4567",
    avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=James",
    role: "Warehouse Manager",
    assignedRegions: ["North America", "Central America"],
    status: "active",
    joinDate: "2023-01-15"
  },
  {
    id: "2",
    name: "Maria Garcia",
    email: "maria.garcia@company.com",
    phone: "+34 612 345 678",
    avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Maria",
    role: "Regional Coordinator",
    assignedRegions: ["Europe", "UK"],
    status: "active",
    joinDate: "2023-03-20"
  },
  {
    id: "3",
    name: "Yuki Tanaka",
    email: "yuki.tanaka@company.com",
    phone: "+81 90-1234-5678",
    avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Yuki",
    role: "Logistics Specialist",
    assignedRegions: ["Asia Pacific", "Japan"],
    status: "active",
    joinDate: "2023-02-10"
  },
  {
    id: "4",
    name: "Ahmed Hassan",
    email: "ahmed.hassan@company.com",
    phone: "+971 50 123 4567",
    avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Ahmed",
    role: "Distribution Manager",
    assignedRegions: ["Middle East", "Africa"],
    status: "active",
    joinDate: "2023-04-05"
  },
  {
    id: "5",
    name: "Sophie Martin",
    email: "sophie.martin@company.com",
    phone: "+33 6 12 34 56 78",
    avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Sophie",
    role: "Warehouse Supervisor",
    assignedRegions: ["Europe"],
    status: "inactive",
    joinDate: "2022-11-12"
  }
];

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
    codFee: "$5.00"
  },
  {
    id: "2",
    name: "DHL International",
    logo: "https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?w=100&h=100&fit=crop",
    regions: ["Europe", "Middle East", "Africa", "Asia Pacific"],
    estimatedDays: "3-5 days",
    cost: "$22.50",
    status: "active",
    codSupported: false
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
    codFee: "$3.00"
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
    codFee: "$2.00"
  },
  {
    id: "5",
    name: "Local Courier Service",
    logo: "https://images.unsplash.com/photo-1494412519320-aa613dfb7738?w=100&h=100&fit=crop",
    regions: ["Central America"],
    estimatedDays: "1 day",
    cost: "$12.00",
    status: "active",
    codSupported: false
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
    codFee: "$4.00"
  }
];

const warehouseLocations: WarehouseLocation[] = [
  {
    id: "1",
    name: "Main Distribution Center - NYC",
    address: "1250 5th Avenue",
    city: "New York",
    region: "North America",
    country: "USA",
    manager: "James Wilson",
    capacity: 50000,
    currentStock: 38500,
    members: 45,
    status: "active"
  },
  {
    id: "2",
    name: "European Hub - Amsterdam",
    address: "Prinsengracht 263-267",
    city: "Amsterdam",
    region: "Europe",
    country: "Netherlands",
    manager: "Maria Garcia",
    capacity: 35000,
    currentStock: 28900,
    members: 32,
    status: "active"
  },
  {
    id: "3",
    name: "Asia Pacific Center - Singapore",
    address: "1 Marina Boulevard",
    city: "Singapore",
    region: "Asia Pacific",
    country: "Singapore",
    manager: "Yuki Tanaka",
    capacity: 42000,
    currentStock: 31200,
    members: 38,
    status: "active"
  },
  {
    id: "4",
    name: "Middle East Warehouse - Dubai",
    address: "Sheikh Zayed Road",
    city: "Dubai",
    region: "Middle East",
    country: "UAE",
    manager: "Ahmed Hassan",
    capacity: 28000,
    currentStock: 19400,
    members: 28,
    status: "active"
  }
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
  "Japan"
];

export function Logistics() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("warehouses");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  
  // Dialog states
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isAddServiceOpen, setIsAddServiceOpen] = useState(false);
  const [isAddWarehouseOpen, setIsAddWarehouseOpen] = useState(false);
  const [isViewDetailsOpen, setIsViewDetailsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // Form states
  const [memberForm, setMemberForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "",
    assignedRegions: [] as string[],
    status: "active"
  });

  const filteredMembers = warehouseMembers.filter(member => {
    const matchesSearch = 
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.role.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRegion = selectedRegion === "all" || 
      member.assignedRegions.includes(selectedRegion);
    
    return matchesSearch && matchesRegion;
  });

  const filteredServices = deliveryServices.filter(service => {
    const matchesSearch = service.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRegion = selectedRegion === "all" || 
      service.regions.includes(selectedRegion);
    
    return matchesSearch && matchesRegion;
  });

  const filteredWarehouses = warehouseLocations.filter(warehouse => {
    const matchesSearch = 
      warehouse.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      warehouse.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      warehouse.manager.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRegion = selectedRegion === "all" || 
      warehouse.region === selectedRegion;
    
    return matchesSearch && matchesRegion;
  });

  // Calculate stats
  const totalMembers = warehouseMembers.length;
  const activeMembers = warehouseMembers.filter(m => m.status === "active").length;
  const totalWarehouses = warehouseLocations.length;
  const totalDeliveryServices = deliveryServices.filter(s => s.status === "active").length;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Logistics Management</h1>
          <p className="text-slate-500 mt-1">Manage warehouses, members, and delivery services</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="bg-white"
            onClick={() => setIsAddWarehouseOpen(true)}
          >
            <Building2 className="w-4 h-4 mr-2" />
            Add Warehouse
          </Button>
          <Button 
            className="bg-slate-900 hover:bg-slate-800"
            onClick={() => setIsAddMemberOpen(true)}
          >
            Add Member
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Total Warehouses</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{totalWarehouses}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Warehouse className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Active Members</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{activeMembers}</p>
                <p className="text-xs text-slate-500 mt-1">of {totalMembers} total</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Delivery Services</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{totalDeliveryServices}</p>
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
                <p className="text-sm font-medium text-slate-500">Total Capacity</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {(warehouseLocations.reduce((sum, w) => sum + w.capacity, 0) / 1000).toFixed(0)}K
                </p>
                <p className="text-xs text-slate-500 mt-1">units</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="warehouses">
                  <Warehouse className="w-4 h-4 mr-2" />
                  Warehouses
                </TabsTrigger>
                <TabsTrigger value="members">
                  <Users className="w-4 h-4 mr-2" />
                  Members
                </TabsTrigger>
                <TabsTrigger value="delivery">
                  <Truck className="w-4 h-4 mr-2" />
                  Delivery Services
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Search and Filters */}
            <div className="flex gap-4 mt-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Filter by region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  {regions.map(region => (
                    <SelectItem key={region} value={region}>{region}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent>
            {/* Warehouses Tab */}
            <TabsContent value="warehouses" className="mt-0">
              <div className="space-y-4">
                {filteredWarehouses.map((warehouse) => (
                  <div
                    key={warehouse.id}
                    className="border border-slate-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-blue-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-900">{warehouse.name}</h3>
                            <p className="text-sm text-slate-500">{warehouse.city}, {warehouse.country}</p>
                          </div>
                          <Badge 
                            variant="secondary"
                            className={
                              warehouse.status === "active"
                                ? "bg-green-100 text-green-700 border-green-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }
                          >
                            {warehouse.status}
                          </Badge>
                        </div>

                        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-xs text-slate-500">Region</p>
                            <p className="text-sm font-medium text-slate-900 mt-1 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {warehouse.region}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Manager</p>
                            <p className="text-sm font-medium text-slate-900 mt-1">{warehouse.manager}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Capacity</p>
                            <p className="text-sm font-medium text-slate-900 mt-1">
                              {warehouse.currentStock.toLocaleString()} / {warehouse.capacity.toLocaleString()}
                            </p>
                            <div className="w-full bg-slate-200 rounded-full h-1.5 mt-1">
                              <div 
                                className="bg-blue-600 h-1.5 rounded-full"
                                style={{ width: `${(warehouse.currentStock / warehouse.capacity) * 100}%` }}
                              />
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Staff</p>
                            <p className="text-sm font-medium text-slate-900 mt-1 flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {warehouse.members} members
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 text-sm text-slate-600">
                          <MapPin className="w-3 h-3 inline mr-1" />
                          {warehouse.address}
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedItem(warehouse);
                              setIsViewDetailsOpen(true);
                            }}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Members Tab */}
            <TabsContent value="members" className="mt-0">
              <div className="space-y-4">
                {filteredMembers.map((member) => (
                  <div
                    key={member.id}
                    className="border border-slate-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <img
                          src={member.avatar}
                          alt={member.name}
                          className="w-16 h-16 rounded-lg border-2 border-slate-200"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-slate-900">{member.name}</h3>
                            <Badge 
                              variant="secondary"
                              className={
                                member.status === "active"
                                  ? "bg-green-100 text-green-700 border-green-200"
                                  : "bg-slate-100 text-slate-700 border-slate-200"
                              }
                            >
                              {member.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-purple-600 font-medium mb-3">{member.role}</p>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Mail className="w-4 h-4" />
                              {member.email}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Phone className="w-4 h-4" />
                              {member.phone}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Clock className="w-4 h-4" />
                              Joined {member.joinDate}
                            </div>
                          </div>

                          <div>
                            <p className="text-xs text-slate-500 mb-2">Assigned Regions:</p>
                            <div className="flex flex-wrap gap-2">
                              {member.assignedRegions.map((region) => (
                                <Badge 
                                  key={region} 
                                  variant="outline"
                                  className="bg-blue-50 text-blue-700 border-blue-200"
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
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedItem(member);
                              setIsViewDetailsOpen(true);
                            }}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View Profile
                          </DropdownMenuItem>
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
            </TabsContent>

            {/* Delivery Services Tab */}
            <TabsContent value="delivery" className="mt-0">
              <div className="mb-4">
                <Button 
                  className="bg-slate-900 hover:bg-slate-800"
                  onClick={() => setIsAddServiceOpen(true)}
                >
                  Add Delivery Service
                </Button>
              </div>

              <div className="space-y-4">
                {filteredServices.map((service) => (
                  <div
                    key={service.id}
                    className="border border-slate-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <img
                          src={service.logo}
                          alt={service.name}
                          className="w-16 h-16 rounded-lg border-2 border-slate-200 object-cover"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
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
                                💰 COD Available
                              </Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3">
                            <div>
                              <p className="text-xs text-slate-500">Estimated Delivery</p>
                              <p className="text-sm font-medium text-slate-900 mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {service.estimatedDays}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Starting Cost</p>
                              <p className="text-sm font-medium text-slate-900 mt-1">{service.cost}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Coverage</p>
                              <p className="text-sm font-medium text-slate-900 mt-1">{service.regions.length} regions</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Cash on Delivery</p>
                              {service.codSupported ? (
                                <p className="text-sm font-medium text-green-600 mt-1">
                                  ✓ Yes {service.codFee && `(+${service.codFee})`}
                                </p>
                              ) : (
                                <p className="text-sm font-medium text-slate-400 mt-1">
                                  ✗ Not available
                                </p>
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="text-xs text-slate-500 mb-2">Available Regions:</p>
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
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedItem(service);
                              setIsViewDetailsOpen(true);
                            }}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
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
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      {/* Add Member Dialog */}
      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Warehouse Member</DialogTitle>
            <DialogDescription>
              Add a new team member to manage warehouse operations
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={memberForm.name}
                  onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="role">Role</Label>
                <Select 
                  value={memberForm.role} 
                  onValueChange={(value) => setMemberForm({ ...memberForm, role: value })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Warehouse Manager">Warehouse Manager</SelectItem>
                    <SelectItem value="Regional Coordinator">Regional Coordinator</SelectItem>
                    <SelectItem value="Logistics Specialist">Logistics Specialist</SelectItem>
                    <SelectItem value="Distribution Manager">Distribution Manager</SelectItem>
                    <SelectItem value="Warehouse Supervisor">Warehouse Supervisor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john.doe@company.com"
                  value={memberForm.email}
                  onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="number"
                  placeholder="+95 9 XXX XXX XXX"
                  value={memberForm.phone}
                  onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
                  className="mt-2"
                />
              </div>
            </div>

            <div>
              <Label>Assigned Regions (select multiple)</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {regions.map((region) => (
                  <label key={region} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={memberForm.assignedRegions.includes(region)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setMemberForm({
                            ...memberForm,
                            assignedRegions: [...memberForm.assignedRegions, region]
                          });
                        } else {
                          setMemberForm({
                            ...memberForm,
                            assignedRegions: memberForm.assignedRegions.filter(r => r !== region)
                          });
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">{region}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddMemberOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-slate-900 hover:bg-slate-800"
              onClick={() => {
                console.log("Adding member:", memberForm);
                setIsAddMemberOpen(false);
              }}
            >
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Delivery Service Dialog */}
      <Dialog open={isAddServiceOpen} onOpenChange={setIsAddServiceOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Delivery Service</DialogTitle>
            <DialogDescription>
              Configure a new delivery service provider for your regions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="serviceName">Service Name</Label>
                <Input
                  id="serviceName"
                  placeholder="FedEx, DHL, etc."
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="estimatedDays">Estimated Delivery</Label>
                <Input
                  id="estimatedDays"
                  placeholder="2-3 days"
                  className="mt-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cost">Starting Cost</Label>
                <Input
                  id="cost"
                  placeholder="$25.99"
                  className="mt-2"
                />
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
                <input
                  type="checkbox"
                  id="codSupported"
                  className="mt-1 rounded"
                />
                <div className="flex-1">
                  <Label htmlFor="codSupported" className="cursor-pointer flex items-center gap-2">
                    <span className="font-semibold">💰 Cash on Delivery (COD)</span>
                  </Label>
                  <p className="text-sm text-slate-600 mt-1">
                    Enable COD payment option for this delivery service
                  </p>
                  <div className="mt-3">
                    <Label htmlFor="codFee" className="text-xs">COD Processing Fee (optional)</Label>
                    <Input
                      id="codFee"
                      placeholder="$5.00"
                      className="mt-1 max-w-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Label>Available Regions (select multiple)</Label>
              <div className="grid grid-cols-3 gap-2 mt-2 max-h-48 overflow-y-auto">
                {regions.map((region) => (
                  <label key={region} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="rounded"
                    />
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
            <Button 
              className="bg-slate-900 hover:bg-slate-800"
              onClick={() => setIsAddServiceOpen(false)}
            >
              Add Service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Warehouse Dialog */}
      <Dialog open={isAddWarehouseOpen} onOpenChange={setIsAddWarehouseOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Warehouse Location</DialogTitle>
            <DialogDescription>
              Add a new warehouse or distribution center
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="warehouseName">Warehouse Name</Label>
              <Input
                id="warehouseName"
                placeholder="Main Distribution Center - NYC"
                className="mt-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="1250 5th Avenue"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  placeholder="New York"
                  className="mt-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="region">Region</Label>
                <Select>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.map((region) => (
                      <SelectItem key={region} value={region}>{region}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  placeholder="USA"
                  className="mt-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="manager">Manager</Label>
                <Select>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select manager" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouseMembers.map((member) => (
                      <SelectItem key={member.id} value={member.name}>{member.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="capacity">Storage Capacity</Label>
                <Input
                  id="capacity"
                  type="number"
                  placeholder="50000"
                  className="mt-2"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddWarehouseOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-slate-900 hover:bg-slate-800"
              onClick={() => setIsAddWarehouseOpen(false)}
            >
              Add Warehouse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}