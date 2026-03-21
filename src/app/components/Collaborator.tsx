import { CollaboratorProfile } from "./CollaboratorProfile";
import { CollaboratorApplications } from "./CollaboratorApplications";
import { CollaboratorForm } from "./CollaboratorForm";
import { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import {
  Search,
  Plus,
  MoreVertical,
  Mail,
  Phone,
  Edit,
  Trash2,
  Eye,
  TrendingUp,
  Users,
  Video,
  Radio,
  Circle,
  FileText,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type CollaboratorStatus = "active" | "inactive" | "pending";
type StreamStatus = "live" | "scheduled" | "offline";

interface Collaborator {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  status: CollaboratorStatus;
  streamStatus: StreamStatus;
  followers: number;
  totalStreams: number;
  totalRevenue: number;
  avgViewers: number;
  commission: number;
  joinedDate: string;
  avatar: string;
  description?: string;
  socialMedia?: {
    instagram?: string;
    youtube?: string;
    tiktok?: string;
  };
}

export function Collaborator() {
  const { t } = useLanguage();
  const [selectedCollaborator, setSelectedCollaborator] = useState<Collaborator | null>(null);
  const [showApplications, setShowApplications] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CollaboratorStatus>("all");

  const [collaborators, setCollaborators] = useState<Collaborator[]>([
    {
      id: "1",
      name: "Sarah Mitchell",
      email: "sarah.mitchell@example.com",
      phone: "+1 (555) 234-5678",
      location: "Los Angeles, CA",
      status: "active",
      streamStatus: "live",
      followers: 125000,
      totalStreams: 48,
      totalRevenue: 516428400,
      avgViewers: 3200,
      commission: 12,
      joinedDate: "Jan 15, 2025",
      avatar: "SM",
      description: "Fashion & Lifestyle Influencer",
      socialMedia: {
        instagram: "@sarahmitchell",
        youtube: "SarahMStyles",
        tiktok: "@sarahm"
      }
    },
    {
      id: "2",
      name: "Alex Chen",
      email: "alex.chen@example.com",
      phone: "+1 (555) 345-6789",
      location: "San Francisco, CA",
      status: "active",
      streamStatus: "scheduled",
      followers: 89000,
      totalStreams: 32,
      totalRevenue: 374745000,
      avgViewers: 2100,
      commission: 10,
      joinedDate: "Feb 8, 2025",
      avatar: "AC",
      description: "Tech Reviews & Gadgets",
      socialMedia: {
        instagram: "@alextech",
        youtube: "AlexChenTech"
      }
    },
    {
      id: "3",
      name: "Maria Rodriguez",
      email: "maria.rodriguez@example.com",
      phone: "+1 (555) 456-7890",
      location: "Miami, FL",
      status: "active",
      streamStatus: "offline",
      followers: 156000,
      totalStreams: 67,
      totalRevenue: 656334000,
      avgViewers: 4500,
      commission: 15,
      joinedDate: "Dec 3, 2024",
      avatar: "MR",
      description: "Beauty & Wellness Expert",
      socialMedia: {
        instagram: "@mariab",
        youtube: "MariaBeauty",
        tiktok: "@mariarodriguez"
      }
    },
    {
      id: "4",
      name: "James Thompson",
      email: "james.thompson@example.com",
      phone: "+1 (555) 567-8901",
      location: "New York, NY",
      status: "active",
      streamStatus: "live",
      followers: 203000,
      totalStreams: 91,
      totalRevenue: 959238000,
      avgViewers: 5800,
      commission: 18,
      joinedDate: "Oct 21, 2024",
      avatar: "JT",
      description: "Fitness & Sports Equipment",
      socialMedia: {
        instagram: "@jamesfitness",
        youtube: "ThompsonFit"
      }
    },
    {
      id: "5",
      name: "Emily Park",
      email: "emily.park@example.com",
      phone: "+1 (555) 678-9012",
      location: "Seattle, WA",
      status: "pending",
      streamStatus: "offline",
      followers: 42000,
      totalStreams: 0,
      totalRevenue: 0,
      avgViewers: 0,
      commission: 8,
      joinedDate: "Feb 1, 2026",
      avatar: "EP",
      description: "Home Decor & DIY",
      socialMedia: {
        instagram: "@emilypark",
        tiktok: "@emilydiy"
      }
    },
    {
      id: "6",
      name: "David Kim",
      email: "david.kim@example.com",
      phone: "+1 (555) 789-0123",
      location: "Austin, TX",
      status: "active",
      streamStatus: "scheduled",
      followers: 178000,
      totalStreams: 55,
      totalRevenue: 607614000,
      avgViewers: 3900,
      commission: 14,
      joinedDate: "Nov 12, 2024",
      avatar: "DK",
      description: "Gaming & Electronics",
      socialMedia: {
        instagram: "@davidgames",
        youtube: "DavidKimGaming",
        tiktok: "@dkim"
      }
    },
  ]);

  const filteredCollaborators = collaborators.filter((collaborator) => {
    const matchesSearch =
      collaborator.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      collaborator.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      collaborator.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || collaborator.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: CollaboratorStatus) => {
    const variants: Record<CollaboratorStatus, { color: string; label: string }> = {
      active: { color: "bg-green-100 text-green-700 border-green-200", label: t('collaborators.active') },
      inactive: { color: "bg-gray-100 text-gray-700 border-gray-200", label: t('collaborators.inactive') },
      pending: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", label: t('collaborators.pending') },
    };
    const variant = variants[status];
    return (
      <Badge className={`${variant.color} border text-xs`}>
        {variant.label}
      </Badge>
    );
  };

  const getStreamStatusBadge = (streamStatus: StreamStatus) => {
    if (streamStatus === "live") {
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 border text-xs animate-pulse">
          <Circle className="w-2 h-2 mr-1 fill-red-600" />
          {t('collaborators.liveNow')}
        </Badge>
      );
    } else if (streamStatus === "scheduled") {
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 border text-xs">
          <Radio className="w-3 h-3 mr-1" />
          {t('collaborators.scheduled')}
        </Badge>
      );
    }
    return (
      <Badge className="bg-gray-100 text-gray-600 border-gray-200 border text-xs">
        {t('collaborators.offline')}
      </Badge>
    );
  };

  const stats = {
    total: collaborators.length,
    active: collaborators.filter((v) => v.status === "active").length,
    pending: collaborators.filter((v) => v.status === "pending").length,
    liveNow: collaborators.filter((v) => v.streamStatus === "live").length,
    totalRevenue: collaborators.reduce((sum, v) => sum + v.totalRevenue, 0),
    totalFollowers: collaborators.reduce((sum, v) => sum + v.followers, 0),
  };

  // If viewing applications, show the applications component
  if (showApplications) {
    return <CollaboratorApplications onBack={() => setShowApplications(false)} />;
  }

  if (selectedCollaborator) {
    return (
      <CollaboratorProfile
        collaborator={selectedCollaborator}
        onBack={() => setSelectedCollaborator(null)}
        onEdit={(collaborator) => {
          console.log("Edit collaborator:", collaborator);
          setSelectedCollaborator(null);
        }}
      />
    );
  }

  if (showForm) {
    return (
      <CollaboratorForm
        onBack={() => setShowForm(false)}
        onSave={(collaborator) => {
          setCollaborators([...collaborators, collaborator]);
          setShowForm(false);
        }}
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('collaborators.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('collaborators.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowApplications(true)}>
            <FileText className="w-4 h-4 mr-2" />
            {t('collaborators.reviewApplications')}
          </Button>
          <Button onClick={() => setShowForm(true)} className="bg-slate-900 hover:bg-slate-800">
            {t('collaborators.addCollaborator')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('collaborators.totalCollaborators')}</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('collaborators.active')}</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.active}</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('livestream.liveNow')}</p>
              <p className="text-2xl font-semibold text-red-600 mt-1">{stats.liveNow}</p>
            </div>
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <Video className="w-5 h-5 text-red-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('collaborators.pending')}</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.pending}</p>
            </div>
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('customers.totalFollowers')}</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">
                {(stats.totalFollowers / 1000).toFixed(0)}K
              </p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('dashboard.totalRevenue')}</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">
                {(stats.totalRevenue / 1000000).toFixed(1)}M Ks
              </p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-orange-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card className="p-4 border border-slate-200">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={t('collaborators.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
            >
              {t('common.all')} ({stats.total})
            </Button>
            <Button
              variant={statusFilter === "active" ? "default" : "outline"}
              onClick={() => setStatusFilter("active")}
            >
              {t('collaborators.active')} ({stats.active})
            </Button>
            <Button
              variant={statusFilter === "pending" ? "default" : "outline"}
              onClick={() => setStatusFilter("pending")}
            >
              {t('collaborators.pending')} ({stats.pending})
            </Button>
          </div>
        </div>
      </Card>

      {/* Collaborators Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCollaborators.map((collaborator) => (
          <Card key={collaborator.id} className="p-5 border border-slate-200 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                  <img
                    src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${collaborator.name}`}
                    alt={collaborator.name}
                    className="w-full h-full"
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{collaborator.name}</h3>
                  <p className="text-xs text-slate-500">{collaborator.description}</p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSelectedCollaborator(collaborator)}>
                    <Eye className="w-4 h-4 mr-2" />
                    {t('collaborators.viewProfile')}
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Edit className="w-4 h-4 mr-2" />
                    {t('collaborators.edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Mail className="w-4 h-4 mr-2" />
                    {t('collaborators.sendEmail')}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600">
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t('collaborators.remove')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{t('collaborators.status')}</span>
                <div className="flex items-center gap-2">
                  {getStatusBadge(collaborator.status)}
                  {getStreamStatusBadge(collaborator.streamStatus)}
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{t('collaborators.followers')}</span>
                <span className="font-medium text-slate-900">
                  {(collaborator.followers / 1000).toFixed(0)}K
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{t('collaborators.avgViewers')}</span>
                <span className="font-medium text-slate-900">
                  {collaborator.avgViewers > 0 ? collaborator.avgViewers.toLocaleString() : 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{t('collaborators.totalStreams')}</span>
                <span className="font-medium text-slate-900">{collaborator.totalStreams}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{t('collaborators.revenueGenerated')}</span>
                <span className="font-semibold text-green-600">
                  {collaborator.totalRevenue.toLocaleString()} Ks
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{t('collaborators.commission')}</span>
                <span className="font-medium text-slate-900">{collaborator.commission}%</span>
              </div>
            </div>

            <Button
              className="w-full"
              variant="outline"
              onClick={() => setSelectedCollaborator(collaborator)}
            >
              <Eye className="w-4 h-4 mr-2" />
              {t('collaborators.viewProfile')}
            </Button>
          </Card>
        ))}
      </div>

      {filteredCollaborators.length === 0 && (
        <Card className="p-12 border border-slate-200 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">{t('collaborators.noResults')}</p>
        </Card>
      )}
    </div>
  );
}