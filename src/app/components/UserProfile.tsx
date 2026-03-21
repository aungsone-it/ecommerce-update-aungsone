import { useState, useEffect } from "react";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Upload,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Shield,
  ShieldCheck,
  FileEdit,
  Code,
  Briefcase,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Edit,
  Store,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface UserProfileProps {
  user: any;
  onBack: () => void;
  onSave: (updatedUser: any) => void;
}

export function UserProfile({ user, onBack, onSave }: UserProfileProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState(user);
  const [avatarPreview, setAvatarPreview] = useState(user.avatar);
  const [isSaving, setIsSaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = reader.result as string;
        setAvatarPreview(base64Data);
        setAvatarFile(base64Data);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      console.log(`💾 Saving user profile: ${user.id}`, editedUser);

      // First, upload avatar if changed
      let avatarUrl = editedUser.avatar;
      if (avatarFile) {
        console.log(`📤 Uploading new avatar...`);
        const avatarResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/users/${user.id}/avatar`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              imageData: avatarFile,
              fileName: `avatar-${Date.now()}.png`,
            }),
          }
        );

        if (!avatarResponse.ok) {
          const errorData = await avatarResponse.json().catch(() => ({ error: avatarResponse.statusText }));
          throw new Error(errorData.error || `Failed to upload avatar: ${avatarResponse.statusText}`);
        }

        const avatarData = await avatarResponse.json();
        avatarUrl = avatarData.avatarUrl;
        console.log(`✅ Avatar uploaded successfully:`, avatarUrl);
      }

      // Then update user profile
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/users/${user.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...editedUser,
            avatar: avatarUrl,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `Failed to update profile: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ User profile updated successfully:`, result.user);

      toast.success("Profile updated successfully!");
      
      // Update local state with the new data
      setEditedUser(result.user);
      setAvatarPreview(result.user.avatar);
      setAvatarFile(null);
      setIsEditing(false);
      
      // Notify parent component
      onSave(result.user);
    } catch (error: any) {
      console.error("❌ Error saving user profile:", error);
      toast.error(`Failed to save profile: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedUser(user);
    setAvatarPreview(user.avatar);
    setAvatarFile(null);
    setIsEditing(false);
  };

  const getRoleInfo = (role: string) => {
    switch (role) {
      case "store-owner":
        return {
          label: "Store Owner",
          icon: Store,
          color: "text-purple-600 bg-purple-100",
          description: "Business owner with full store access and control",
        };
      case "administrator":
        return {
          label: "Administrator",
          icon: ShieldCheck,
          color: "text-blue-600 bg-blue-100",
          description: "Manage products, orders, and users",
        };
      case "data-entry":
        return {
          label: "Data Entry",
          icon: FileEdit,
          color: "text-green-600 bg-green-100",
          description: "Add and edit products, manage inventory",
        };
      case "developer":
        return {
          label: "Developer",
          icon: Code,
          color: "text-orange-600 bg-orange-100",
          description: "Technical access for integrations",
        };
      case "product-manager":
        return {
          label: "Product Manager",
          icon: Briefcase,
          color: "text-pink-600 bg-pink-100",
          description: "Define and manage product strategy",
        };
      default:
        return {
          label: "Unknown",
          icon: Shield,
          color: "text-slate-600 bg-slate-100",
          description: "",
        };
    }
  };

  const roleInfo = getRoleInfo(editedUser.role);
  const RoleIcon = roleInfo.icon;

  // Mock activity data
  const recentActivity = [
    {
      id: "1",
      action: "Updated product",
      target: "iPhone 14 Pro",
      timestamp: "2026-02-05 14:32",
      status: "success",
    },
    {
      id: "2",
      action: "Created order",
      target: "#ORD-1028",
      timestamp: "2026-02-05 11:15",
      status: "success",
    },
    {
      id: "3",
      action: "Added user",
      target: "John Smith",
      timestamp: "2026-02-04 16:48",
      status: "success",
    },
    {
      id: "4",
      action: "Failed login attempt",
      target: "Security alert",
      timestamp: "2026-02-03 09:23",
      status: "failed",
    },
    {
      id: "5",
      action: "Updated inventory",
      target: "45 products",
      timestamp: "2026-02-02 13:07",
      status: "success",
    },
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Users
            </Button>
            <div className="h-6 w-px bg-slate-300"></div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                {isEditing ? "Edit User Profile" : "User Profile"}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {isEditing
                  ? "Update user information and permissions"
                  : "View user details and activity"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                  Cancel
                </Button>
                <Button
                  className="bg-slate-900 hover:bg-slate-800 text-white"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? "Saving..." : "Save changes"}
                </Button>
              </>
            ) : (
              <Button
                className="bg-slate-900 hover:bg-slate-800 text-white"
                onClick={() => setIsEditing(true)}
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit profile
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6">
          <div className="grid grid-cols-3 gap-6">
            {/* Left Column - Profile Card */}
            <div className="col-span-1 space-y-6">
              {/* Profile Card */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="flex flex-col items-center text-center">
                  {/* Avatar */}
                  <div className="relative group mb-4">
                    <img
                      src={avatarPreview}
                      alt={editedUser.name}
                      className="w-24 h-24 rounded-full"
                    />
                    {isEditing && (
                      <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <Upload className="w-6 h-6 text-white" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleImageUpload}
                        />
                      </label>
                    )}
                  </div>

                  {/* Name */}
                  <h2 className="text-xl font-semibold text-slate-900 mb-1">
                    {editedUser.name}
                  </h2>

                  {/* Role Badge */}
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${roleInfo.color} mb-3`}
                  >
                    <RoleIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">{roleInfo.label}</span>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2 text-sm mb-4">
                    {editedUser.status === "active" ? (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-green-600 font-medium">Active</span>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                        <span className="text-slate-600 font-medium">
                          Inactive
                        </span>
                      </>
                    )}
                  </div>

                  {/* Quick Stats */}
                  <div className="w-full grid grid-cols-2 gap-3 pt-4 border-t border-slate-200">
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-slate-900">127</p>
                      <p className="text-xs text-slate-500 mt-1">Actions</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-slate-900">45</p>
                      <p className="text-xs text-slate-500 mt-1">Days Active</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Role Permissions Card */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">
                  Role Permissions
                </h3>
                <div className="space-y-3 text-xs text-slate-600">
                  {editedUser.role === "store-owner" && (
                    <>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Full system access</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Manage all users</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Access financial data</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Modify store settings</span>
                      </div>
                    </>
                  )}
                  {editedUser.role === "administrator" && (
                    <>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Manage products & orders</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Access marketing tools</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>View reports & analytics</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>No financial data access</span>
                      </div>
                    </>
                  )}
                  {editedUser.role === "data-entry" && (
                    <>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Add & edit products</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Manage inventory</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>No order access</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>No settings access</span>
                      </div>
                    </>
                  )}
                  {editedUser.role === "developer" && (
                    <>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>API access</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Custom integrations</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Debug tools</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>No user data access</span>
                      </div>
                    </>
                  )}
                  {editedUser.role === "product-manager" && (
                    <>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Product strategy</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Feature planning</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Team collaboration</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>No financial data</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Details */}
            <div className="col-span-2 space-y-6">
              {/* Personal Information */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  Personal Information
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label
                        htmlFor="name"
                        className="text-sm font-medium text-slate-900 mb-2 block"
                      >
                        Full Name
                      </Label>
                      {isEditing ? (
                        <Input
                          id="name"
                          value={editedUser.name}
                          onChange={(e) =>
                            setEditedUser({ ...editedUser, name: e.target.value })
                          }
                          className="h-10"
                        />
                      ) : (
                        <div className="flex items-center gap-2 h-10 px-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-sm text-slate-700">
                            {editedUser.name}
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label
                        htmlFor="email"
                        className="text-sm font-medium text-slate-900 mb-2 block"
                      >
                        Email Address
                      </Label>
                      {isEditing ? (
                        <Input
                          id="email"
                          type="email"
                          value={editedUser.email}
                          onChange={(e) =>
                            setEditedUser({ ...editedUser, email: e.target.value })
                          }
                          className="h-10"
                        />
                      ) : (
                        <div className="flex items-center gap-2 h-10 px-3 bg-slate-50 rounded-lg border border-slate-200">
                          <Mail className="w-4 h-4 text-slate-400" />
                          <span className="text-sm text-slate-700">
                            {editedUser.email}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label
                        htmlFor="phone"
                        className="text-sm font-medium text-slate-900 mb-2 block"
                      >
                        Phone Number
                      </Label>
                      {isEditing ? (
                        <Input
                          id="phone"
                          value={editedUser.phone || ""}
                          onChange={(e) =>
                            setEditedUser({ ...editedUser, phone: e.target.value })
                          }
                          placeholder="+1 (555) 123-4567"
                          className="h-10"
                        />
                      ) : (
                        <div className="flex items-center gap-2 h-10 px-3 bg-slate-50 rounded-lg border border-slate-200">
                          <Phone className="w-4 h-4 text-slate-400" />
                          <span className="text-sm text-slate-700">
                            {editedUser.phone || "Not provided"}
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label
                        htmlFor="location"
                        className="text-sm font-medium text-slate-900 mb-2 block"
                      >
                        Location
                      </Label>
                      {isEditing ? (
                        <Input
                          id="location"
                          value={editedUser.location || ""}
                          onChange={(e) =>
                            setEditedUser({
                              ...editedUser,
                              location: e.target.value,
                            })
                          }
                          placeholder="City, Country"
                          className="h-10"
                        />
                      ) : (
                        <div className="flex items-center gap-2 h-10 px-3 bg-slate-50 rounded-lg border border-slate-200">
                          <MapPin className="w-4 h-4 text-slate-400" />
                          <span className="text-sm text-slate-700">
                            {editedUser.location || "Not provided"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label
                      htmlFor="bio"
                      className="text-sm font-medium text-slate-900 mb-2 block"
                    >
                      Bio
                    </Label>
                    {isEditing ? (
                      <Textarea
                        id="bio"
                        value={editedUser.bio || ""}
                        onChange={(e) =>
                          setEditedUser({ ...editedUser, bio: e.target.value })
                        }
                        placeholder="Tell us about yourself..."
                        className="resize-y min-h-[100px]"
                      />
                    ) : (
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[100px]">
                        <p className="text-sm text-slate-700">
                          {editedUser.bio || "No bio provided"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Role & Access */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  Role & Access
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label
                        htmlFor="role"
                        className="text-sm font-medium text-slate-900 mb-2 block"
                      >
                        User Role
                      </Label>
                      {isEditing ? (
                        <Select
                          value={editedUser.role}
                          onValueChange={(value) =>
                            setEditedUser({ ...editedUser, role: value })
                          }
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="store-owner">Store Owner</SelectItem>
                            <SelectItem value="administrator">
                              Administrator
                            </SelectItem>
                            <SelectItem value="data-entry">Data Entry</SelectItem>
                            <SelectItem value="developer">Developer</SelectItem>
                            <SelectItem value="product-manager">
                              Product Manager
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div
                          className={`flex items-center gap-2 h-10 px-3 rounded-lg ${roleInfo.color}`}
                        >
                          <RoleIcon className="w-4 h-4" />
                          <span className="text-sm font-medium">
                            {roleInfo.label}
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-slate-900 mb-2 block">
                        Account Status
                      </Label>
                      {isEditing ? (
                        <div className="flex items-center gap-3 h-10">
                          <Switch
                            checked={editedUser.status === "active"}
                            onCheckedChange={(checked) =>
                              setEditedUser({
                                ...editedUser,
                                status: checked ? "active" : "inactive",
                              })
                            }
                          />
                          <span className="text-sm text-slate-700">
                            {editedUser.status === "active" ? "Active" : "Inactive"}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 h-10 px-3 bg-slate-50 rounded-lg border border-slate-200">
                          {editedUser.status === "active" ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-slate-400" />
                          )}
                          <span className="text-sm text-slate-700">
                            {editedUser.status === "active" ? "Active" : "Inactive"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-slate-900 mb-2 block">
                        Member Since
                      </Label>
                      <div className="flex items-center gap-2 h-10 px-3 bg-slate-50 rounded-lg border border-slate-200">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-700">
                          {new Date(editedUser.lastActive).toLocaleDateString(
                            "en-US",
                            { year: "numeric", month: "long", day: "numeric" }
                          )}
                        </span>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-slate-900 mb-2 block">
                        Last Active
                      </Label>
                      <div className="flex items-center gap-2 h-10 px-3 bg-slate-50 rounded-lg border border-slate-200">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-700">
                          {new Date(editedUser.lastActive).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Recent Activity
                  </h3>
                  <Activity className="w-5 h-5 text-slate-400" />
                </div>
                <div className="space-y-3">
                  {recentActivity.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          activity.status === "success"
                            ? "bg-green-100"
                            : "bg-red-100"
                        }`}
                      >
                        {activity.status === "success" ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {activity.action}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {activity.target}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0">
                        <Clock className="w-3 h-3" />
                        <span>{activity.timestamp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}