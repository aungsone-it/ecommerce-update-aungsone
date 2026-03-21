import { useState } from "react";
import {
  ArrowLeft,
  Save,
  Upload,
  X,
  MapPin,
  Mail,
  Phone,
  User,
  IdCard,
  Image as ImageIcon,
  Globe,
  Instagram,
  Youtube,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { compressImage } from "../../utils/imageCompression";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Card } from "./ui/card";

interface CollaboratorFormProps {
  onBack: () => void;
  onSave: (collaborator: any) => void;
  editingCollaborator?: any;
}

export function CollaboratorForm({ onBack, onSave, editingCollaborator }: CollaboratorFormProps) {
  const [name, setName] = useState(editingCollaborator?.name || "");
  const [email, setEmail] = useState(editingCollaborator?.email || "");
  const [phone, setPhone] = useState(editingCollaborator?.phone || "");
  const [location, setLocation] = useState(editingCollaborator?.location || "");
  const [description, setDescription] = useState(editingCollaborator?.description || "");
  const [commission, setCommission] = useState(editingCollaborator?.commission || 10);
  const [status, setStatus] = useState(editingCollaborator?.status || "pending");
  
  // Social Media
  const [instagram, setInstagram] = useState(editingCollaborator?.socialMedia?.instagram || "");
  const [youtube, setYoutube] = useState(editingCollaborator?.socialMedia?.youtube || "");
  const [tiktok, setTiktok] = useState(editingCollaborator?.socialMedia?.tiktok || "");
  const [website, setWebsite] = useState("");

  // Image uploads
  const [profileImage, setProfileImage] = useState<string | null>(editingCollaborator?.avatar || null);
  const [idCardImage, setIdCardImage] = useState<string | null>(null);

  const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedImage = await compressImage(file, 500);
        setProfileImage(compressedImage);
        toast.success('Profile image compressed successfully!');
      } catch (error) {
        console.error('Image compression error:', error);
        toast.error('Failed to compress image. Please try a smaller file.');
      }
    }
  };

  const handleIdCardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedImage = await compressImage(file, 500);
        setIdCardImage(compressedImage);
        toast.success('ID card image compressed successfully!');
      } catch (error) {
        console.error('Image compression error:', error);
        toast.error('Failed to compress image. Please try a smaller file.');
      }
    }
  };

  const handleSave = () => {
    const collaboratorData = {
      id: editingCollaborator?.id || Math.random().toString(36).substring(2, 9),
      name,
      email,
      phone,
      location,
      description,
      commission: Number(commission),
      status,
      streamStatus: "offline",
      followers: editingCollaborator?.followers || 0,
      totalStreams: editingCollaborator?.totalStreams || 0,
      totalRevenue: editingCollaborator?.totalRevenue || 0,
      avgViewers: editingCollaborator?.avgViewers || 0,
      joinedDate: editingCollaborator?.joinedDate || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      avatar: profileImage || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${name}`,
      socialMedia: {
        instagram,
        youtube,
        tiktok,
      },
      idCard: idCardImage,
    };
    onSave(collaboratorData);
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  {editingCollaborator ? "Edit Collaborator" : "Add New Collaborator"}
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  {editingCollaborator ? "Update collaborator information" : "Create a new collaborator profile"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onBack}>
                Cancel
              </Button>
              <Button onClick={handleSave} className="bg-slate-900 hover:bg-slate-800 text-white">
                <Save className="w-4 h-4 mr-2" />
                Save Collaborator
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content - Split Layout */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Main Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Basic Information */}
              <Card className="p-6 border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Basic Information</h2>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name" className="text-sm font-medium text-slate-900 mb-2 block">
                      Full Name <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="name"
                        placeholder="Enter full name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="pl-10 h-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="description" className="text-sm font-medium text-slate-900 mb-2 block">
                      Description / Category
                    </Label>
                    <Textarea
                      id="description"
                      placeholder="e.g., Fashion & Lifestyle Influencer"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="resize-y min-h-[80px]"
                    />
                  </div>
                </div>
              </Card>

              {/* Contact Information */}
              <Card className="p-6 border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Contact Information</h2>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="email" className="text-sm font-medium text-slate-900 mb-2 block">
                      Email Address <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="collaborator@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 h-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="phone" className="text-sm font-medium text-slate-900 mb-2 block">
                      Phone Number <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="phone"
                        type="number"
                        placeholder="+95 9 XXX XXX XXX"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-10 h-10"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="location" className="text-sm font-medium text-slate-900 mb-2 block">
                      Location
                    </Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="location"
                        placeholder="City, State/Country"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="pl-10 h-10"
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Social Media */}
              <Card className="p-6 border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Social Media</h2>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="instagram" className="text-sm font-medium text-slate-900 mb-2 block">
                      Instagram
                    </Label>
                    <div className="relative">
                      <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="instagram"
                        placeholder="@username"
                        value={instagram}
                        onChange={(e) => setInstagram(e.target.value)}
                        className="pl-10 h-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="youtube" className="text-sm font-medium text-slate-900 mb-2 block">
                      YouTube
                    </Label>
                    <div className="relative">
                      <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="youtube"
                        placeholder="Channel name"
                        value={youtube}
                        onChange={(e) => setYoutube(e.target.value)}
                        className="pl-10 h-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="tiktok" className="text-sm font-medium text-slate-900 mb-2 block">
                      TikTok
                    </Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="tiktok"
                        placeholder="@username"
                        value={tiktok}
                        onChange={(e) => setTiktok(e.target.value)}
                        className="pl-10 h-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="website" className="text-sm font-medium text-slate-900 mb-2 block">
                      Website
                    </Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="website"
                        placeholder="https://example.com"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        className="pl-10 h-10"
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* ID Verification */}
              <Card className="p-6 border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">ID Verification</h2>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-slate-900 mb-2 block">
                      National ID Card / Passport <span className="text-red-500">*</span>
                    </Label>
                    <p className="text-xs text-slate-500 mb-3">
                      Upload a clear photo of the collaborator's national ID card or passport for verification
                    </p>
                    
                    {idCardImage ? (
                      <div className="relative border-2 border-slate-200 rounded-lg overflow-hidden">
                        <img
                          src={idCardImage}
                          alt="ID Card"
                          className="w-full h-64 object-cover"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2"
                          onClick={() => setIdCardImage(null)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <label className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:border-slate-400 transition-colors">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                          <IdCard className="w-6 h-6 text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-900 mb-1">
                          Click to upload ID card
                        </p>
                        <p className="text-xs text-slate-500">
                          PNG, JPG or PDF up to 10MB
                        </p>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={handleIdCardUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {/* Right Column - Status & Media */}
            <div className="space-y-6">
              {/* Status Settings */}
              <Card className="p-6 border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Status</h2>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="status" className="text-sm font-medium text-slate-900 mb-2 block">
                      Account Status
                    </Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="commission" className="text-sm font-medium text-slate-900 mb-2 block">
                      Commission Rate (%)
                    </Label>
                    <Input
                      id="commission"
                      type="number"
                      min="0"
                      max="100"
                      value={commission}
                      onChange={(e) => setCommission(e.target.value)}
                      className="h-10"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Percentage of sales revenue shared with this collaborator
                    </p>
                  </div>
                </div>
              </Card>

              {/* Profile Image */}
              <Card className="p-6 border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Profile Image</h2>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-slate-900 mb-2 block">
                      Profile Photo
                    </Label>
                    <p className="text-xs text-slate-500 mb-3">
                      Upload a professional profile photo
                    </p>

                    {profileImage ? (
                      <div className="relative">
                        <div className="w-full aspect-square rounded-lg overflow-hidden border-2 border-slate-200">
                          <img
                            src={profileImage}
                            alt="Profile"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2"
                          onClick={() => setProfileImage(null)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <label className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:border-slate-400 transition-colors aspect-square">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                          <ImageIcon className="w-8 h-8 text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-900 mb-1 text-center">
                          Click to upload
                        </p>
                        <p className="text-xs text-slate-500 text-center">
                          PNG or JPG
                        </p>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleProfileImageUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}