import { Card } from "./ui/card";
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface VendorFormProps {
  onBack: () => void;
  onSave: (vendor: any) => void;
  editingVendor?: any;
}

export function VendorForm({ onBack, onSave, editingVendor }: VendorFormProps) {
  const [name, setName] = useState(editingVendor?.name || "");
  const [email, setEmail] = useState(editingVendor?.email || "");
  const [phone, setPhone] = useState(editingVendor?.phone || "");
  const [location, setLocation] = useState(editingVendor?.location || "");
  const [businessType, setBusinessType] = useState(editingVendor?.businessType || "");
  const [description, setDescription] = useState(editingVendor?.description || "");
  const [commission, setCommission] = useState(editingVendor?.commission || 15);
  const [status, setStatus] = useState(editingVendor?.status || "pending");
  
  // Business Information
  const [businessAddress, setBusinessAddress] = useState(editingVendor?.businessAddress || "");
  const [taxId, setTaxId] = useState(editingVendor?.taxId || "");
  const [website, setWebsite] = useState(editingVendor?.website || "");
  const [bankName, setBankName] = useState(editingVendor?.bankName || "");
  const [accountNumber, setAccountNumber] = useState(editingVendor?.accountNumber || "");

  // Image uploads
  const [logoImage, setLogoImage] = useState<string | null>(editingVendor?.logo || null);
  const [businessLicense, setBusinessLicense] = useState<string | null>(null);
  const [idCardImage, setIdCardImage] = useState<string | null>(null);

  // 🔥 Real-time validation states
  const [emailValidation, setEmailValidation] = useState<{ checking: boolean; error: string; valid: boolean }>({
    checking: false,
    error: '',
    valid: false
  });
  const [phoneValidation, setPhoneValidation] = useState<{ checking: boolean; error: string; valid: boolean }>({
    checking: false,
    error: '',
    valid: false
  });
  
  // Debounce timers
  const emailCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const phoneCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (emailCheckTimeoutRef.current) clearTimeout(emailCheckTimeoutRef.current);
      if (phoneCheckTimeoutRef.current) clearTimeout(phoneCheckTimeoutRef.current);
    };
  }, []);

  // 🔥 Real-time email validation (only for new vendors, not when editing)
  useEffect(() => {
    if (editingVendor) return; // Skip validation when editing existing vendor
    
    if (emailCheckTimeoutRef.current) clearTimeout(emailCheckTimeoutRef.current);
    
    if (email && email.trim()) {
      setEmailValidation({ checking: true, error: '', valid: false });
      emailCheckTimeoutRef.current = setTimeout(async () => {
        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors/validate`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`
              },
              body: JSON.stringify({ email: email.trim() })
            }
          );
          const data = await response.json();
          
          if (isMountedRef.current) {
            if (data.errors?.email) {
              setEmailValidation({ checking: false, error: data.errors.email, valid: false });
            } else {
              setEmailValidation({ checking: false, error: '', valid: true });
            }
          }
        } catch (error) {
          console.error('Email validation error:', error);
          if (isMountedRef.current) {
            setEmailValidation({ checking: false, error: '', valid: false });
          }
        }
      }, 800); // 800ms debounce
    } else {
      setEmailValidation({ checking: false, error: '', valid: false });
    }
  }, [email, editingVendor]);

  // 🔥 Real-time phone validation (only for new vendors, not when editing)
  useEffect(() => {
    if (editingVendor) return; // Skip validation when editing existing vendor
    
    if (phoneCheckTimeoutRef.current) clearTimeout(phoneCheckTimeoutRef.current);
    
    if (phone && phone.trim()) {
      setPhoneValidation({ checking: true, error: '', valid: false });
      phoneCheckTimeoutRef.current = setTimeout(async () => {
        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors/validate`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`
              },
              body: JSON.stringify({ phone: phone.trim() })
            }
          );
          const data = await response.json();
          
          if (isMountedRef.current) {
            if (data.errors?.phone) {
              setPhoneValidation({ checking: false, error: data.errors.phone, valid: false });
            } else {
              setPhoneValidation({ checking: false, error: '', valid: true });
            }
          }
        } catch (error) {
          console.error('Phone validation error:', error);
          if (isMountedRef.current) {
            setPhoneValidation({ checking: false, error: '', valid: false });
          }
        }
      }, 800); // 800ms debounce
    } else {
      setPhoneValidation({ checking: false, error: '', valid: false });
    }
  }, [phone, editingVendor]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBusinessLicenseUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBusinessLicense(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleIdCardUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setIdCardImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    // 🔥 Prevent save if there are validation errors (only for new vendors)
    if (!editingVendor) {
      if (emailValidation.error) {
        alert(emailValidation.error);
        return;
      }
      if (phoneValidation.error) {
        alert(phoneValidation.error);
        return;
      }
    }
    
    const vendorData = {
      id: editingVendor?.id || Math.random().toString(36).substring(2, 9),
      name,
      email,
      phone,
      location,
      businessType,
      description,
      commission: Number(commission),
      status,
      businessAddress,
      taxId,
      website,
      bankName,
      accountNumber,
      productsCount: editingVendor?.productsCount || 0,
      totalRevenue: editingVendor?.totalRevenue || 0,
      joinedDate: editingVendor?.joinedDate || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      avatar: logoImage || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${name}`,
      logo: logoImage,
      businessLicense: businessLicense,
      idCard: idCardImage,
    };
    onSave(vendorData);
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
                  {editingVendor ? "Edit Vendor" : "Add New Vendor"}
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  {editingVendor ? "Update vendor information" : "Create a new vendor profile"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onBack}>
                Cancel
              </Button>
              <Button onClick={handleSave} className="bg-slate-900 hover:bg-slate-800 text-white">
                <Save className="w-4 h-4 mr-2" />
                Save Vendor
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
                      Vendor Name <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="name"
                        placeholder="e.g., TechGear Electronics"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="pl-10 h-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="businessType" className="text-sm font-medium text-slate-900 mb-2 block">
                      Business Type
                    </Label>
                    <Select value={businessType} onValueChange={setBusinessType}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select business type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manufacturer">Manufacturer</SelectItem>
                        <SelectItem value="wholesaler">Wholesaler</SelectItem>
                        <SelectItem value="retailer">Retailer</SelectItem>
                        <SelectItem value="distributor">Distributor</SelectItem>
                        <SelectItem value="dropshipper">Dropshipper</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="description" className="text-sm font-medium text-slate-900 mb-2 block">
                      Description
                    </Label>
                    <Textarea
                      id="description"
                      placeholder="Brief description of the vendor's business"
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
                        placeholder="contact@vendor.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 h-10"
                      />
                    </div>
                    {emailValidation.checking && (
                      <p className="text-xs text-slate-500 mt-1">
                        Checking...
                      </p>
                    )}
                    {emailValidation.error && (
                      <p className="text-xs text-red-500 mt-1">
                        {emailValidation.error}
                      </p>
                    )}
                    {emailValidation.valid && (
                      <p className="text-xs text-green-500 mt-1">
                        <CheckCircle2 className="w-4 h-4 inline-block mr-1" />
                        Available
                      </p>
                    )}
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
                    {phoneValidation.checking && (
                      <p className="text-xs text-slate-500 mt-1">
                        Checking...
                      </p>
                    )}
                    {phoneValidation.error && (
                      <p className="text-xs text-red-500 mt-1">
                        {phoneValidation.error}
                      </p>
                    )}
                    {phoneValidation.valid && (
                      <p className="text-xs text-green-500 mt-1">
                        <CheckCircle2 className="w-4 h-4 inline-block mr-1" />
                        Available
                      </p>
                    )}
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

                  <div>
                    <Label htmlFor="website" className="text-sm font-medium text-slate-900 mb-2 block">
                      Website
                    </Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="website"
                        placeholder="https://vendor.com"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        className="pl-10 h-10"
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Business Details */}
              <Card className="p-6 border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Business Details</h2>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="businessAddress" className="text-sm font-medium text-slate-900 mb-2 block">
                      Business Address <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="businessAddress"
                      placeholder="Full business address"
                      value={businessAddress}
                      onChange={(e) => setBusinessAddress(e.target.value)}
                      className="resize-y min-h-[80px]"
                    />
                  </div>

                  <div>
                    <Label htmlFor="taxId" className="text-sm font-medium text-slate-900 mb-2 block">
                      Tax ID / Business Registration Number
                    </Label>
                    <Input
                      id="taxId"
                      placeholder="e.g., 12-3456789"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>
              </Card>

              {/* Banking Information */}
              <Card className="p-6 border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Banking Information</h2>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="bankName" className="text-sm font-medium text-slate-900 mb-2 block">
                      Bank Name
                    </Label>
                    <Input
                      id="bankName"
                      placeholder="e.g., Chase Bank"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="h-10"
                    />
                  </div>

                  <div>
                    <Label htmlFor="accountNumber" className="text-sm font-medium text-slate-900 mb-2 block">
                      Account Number
                    </Label>
                    <Input
                      id="accountNumber"
                      placeholder="Enter account number"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>
              </Card>

              {/* Documents */}
              <Card className="p-6 border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Verification Documents</h2>
                <div className="space-y-6">
                  {/* Business License */}
                  <div>
                    <Label className="text-sm font-medium text-slate-900 mb-2 block">
                      Business License <span className="text-red-500">*</span>
                    </Label>
                    <p className="text-xs text-slate-500 mb-3">
                      Upload the vendor's business license or registration certificate
                    </p>
                    
                    {businessLicense ? (
                      <div className="relative border-2 border-slate-200 rounded-lg overflow-hidden">
                        <img
                          src={businessLicense}
                          alt="Business License"
                          className="w-full h-64 object-cover"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2"
                          onClick={() => setBusinessLicense(null)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <label className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:border-slate-400 transition-colors">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                          <FileText className="w-6 h-6 text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-900 mb-1">
                          Click to upload business license
                        </p>
                        <p className="text-xs text-slate-500">
                          PNG, JPG or PDF up to 10MB
                        </p>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={handleBusinessLicenseUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* Owner ID Card */}
                  <div>
                    <Label className="text-sm font-medium text-slate-900 mb-2 block">
                      Owner's ID Card / Passport <span className="text-red-500">*</span>
                    </Label>
                    <p className="text-xs text-slate-500 mb-3">
                      Upload a clear photo of the owner's national ID card or passport
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
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Status & Commission</h2>
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
                        <SelectItem value="suspended">Suspended</SelectItem>
                        <SelectItem value="banned">Banned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="commission" className="text-sm font-medium text-slate-900 mb-2 block">
                      Commission Rate (%)
                    </Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="commission"
                        type="number"
                        min="0"
                        max="100"
                        value={commission}
                        onChange={(e) => setCommission(e.target.value)}
                        className="h-10 pl-10"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Percentage of sales revenue that goes to the platform
                    </p>
                  </div>
                </div>
              </Card>

              {/* Logo */}
              <Card className="p-6 border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Vendor Logo</h2>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-slate-900 mb-2 block">
                      Company Logo
                    </Label>
                    <p className="text-xs text-slate-500 mb-3">
                      Upload the vendor's company logo
                    </p>

                    {logoImage ? (
                      <div className="relative">
                        <div className="w-full aspect-square rounded-lg overflow-hidden border-2 border-slate-200">
                          <img
                            src={logoImage}
                            alt="Logo"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2"
                          onClick={() => setLogoImage(null)}
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
                          onChange={handleLogoUpload}
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