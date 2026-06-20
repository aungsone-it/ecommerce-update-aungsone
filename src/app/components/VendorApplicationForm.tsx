import { useState, useEffect, useRef } from "react";
import { 
  CheckCircle2, 
  ArrowLeft, 
  ShoppingBag, 
  Building2, 
  User, 
  MapPin, 
  CreditCard, 
  FileText, 
  Upload, 
  X, 
  Mail,
  Sparkles,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { publicAnonKey } from "../../../utils/supabase/info";
import { API_BASE_URL } from "../../utils/api-client";
import {
  invalidateAdminVendorApplicationsCache,
  notifyAdminVendorApplicationsUpdated,
} from "../utils/module-cache";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { VendorOnlinePresenceFormFields } from "./VendorOnlinePresenceFields";
import {
  VENDOR_ONLINE_PRESENCE_FIELDS,
  validateOptionalOnlinePresenceField,
} from "../utils/vendorOnlinePresence";

interface VendorApplicationFormProps {
  onBack?: () => void;
  source?: "admin" | "storefront";
}

const BUSINESS_TYPE_OPTIONS = [
  "Sole Proprietorship",
  "Partnership",
  "Limited Liability Company (LLC)",
  "Corporation",
  "Other",
] as const;

/** Simplified but strict email check (no spaces, sensible TLD). */
function isValidEmailStrict(email: string): boolean {
  const t = email.trim();
  if (t.length < 5 || t.length > 254) return false;
  const re =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!re.test(t)) return false;
  if (t.includes("..")) return false;
  const domain = t.split("@")[1] || "";
  if (!domain.includes(".")) return false;
  const tld = domain.split(".").pop() || "";
  return tld.length >= 2 && tld.length <= 24;
}

/** Myanmar (+959 / 09) or international 10–15 digit subscriber. */
function isValidPhoneStrict(phone: string): boolean {
  const raw = phone.trim();
  if (!raw) return false;
  const normalized = raw.replace(/[\s\-()]/g, "");

  if (/^(\+959|09)\d{9}$/.test(normalized)) return true;

  const digits = normalized.replace(/\D/g, "");
  if (/^959\d{9}$/.test(digits) || /^09\d{9}$/.test(digits)) return true;

  if (digits.length >= 10 && digits.length <= 15 && !digits.startsWith("0")) return true;

  return false;
}

function validateRegistrationNumber(s: string): boolean {
  const t = s.trim();
  if (t.length < 4 || t.length > 40) return false;
  return /^[A-Za-z0-9\-/ ]+$/.test(t);
}

type VendorApplicationType = "professional" | "influencer";

function validateSharedApplicationFields(formData: Record<string, unknown>): string[] {
  const errs: string[] = [];
  const str = (k: string) => String(formData[k] ?? "").trim();

  const contactName = str("contactName");
  if (contactName.length < 2 || contactName.length > 100) {
    errs.push("Full name must be between 2 and 100 characters.");
  } else if (!/[a-zA-Z\u00C0-\u024F]/.test(contactName)) {
    errs.push("Full name must include at least one letter.");
  }

  const email = str("email");
  if (!isValidEmailStrict(email)) {
    errs.push("Enter a valid email address.");
  }

  const phone = String(formData.phone ?? "");
  if (!isValidPhoneStrict(phone)) {
    errs.push(
      "Enter a valid phone number (Myanmar: +959XXXXXXXXX or 09XXXXXXXXX, or 10–15 digits international)."
    );
  }

  const storeName = str("storeName");
  if (storeName.length < 2 || storeName.length > 80) {
    errs.push("Store name must be between 2 and 80 characters.");
  }

  const storeDescription = str("storeDescription");
  if (storeDescription.length < 10 || storeDescription.length > 5000) {
    errs.push("Store description must be at least 10 characters and at most 5,000 characters.");
  }

  const categories = formData.categories as unknown;
  if (!Array.isArray(categories) || categories.length < 1) {
    errs.push("Select at least one product category.");
  }

  const bankName = str("bankName");
  if (bankName.length < 2 || bankName.length > 100) {
    errs.push("Bank name must be between 2 and 100 characters.");
  }

  const accountName = str("accountName");
  if (accountName.length < 2 || accountName.length > 120) {
    errs.push("Account holder name must be between 2 and 120 characters.");
  }

  const acctDigits = str("accountNumber").replace(/\D/g, "");
  if (!/^\d{6,22}$/.test(acctDigits)) {
    errs.push("Account number must be 6–22 digits (spaces allowed for grouping).");
  }

  const agree = Boolean(formData.agreeToTerms);
  const privacy = Boolean(formData.acceptPrivacy);
  if (!agree) errs.push("You must agree to the terms and conditions.");
  if (!privacy) errs.push("You must accept the privacy policy.");

  return errs;
}

function validateProfessionalApplicationFields(
  formData: Record<string, unknown>,
  files: { businessLicense: File | null; idDocument: File | null },
  allowedBusinessTypes: readonly string[]
): string[] {
  const errs: string[] = [];
  const str = (k: string) => String(formData[k] ?? "").trim();

  const companyName = str("companyName");
  if (companyName.length < 2 || companyName.length > 120) {
    errs.push("Company name must be between 2 and 120 characters.");
  }

  const businessType = str("businessType");
  if (!businessType || !allowedBusinessTypes.includes(businessType)) {
    errs.push("Please select a valid business type.");
  }

  const reg = str("registrationNumber");
  if (!validateRegistrationNumber(reg)) {
    errs.push(
      "Business registration number is required (4–40 characters: letters, numbers, spaces, hyphen or /)."
    );
  }

  const address = str("address");
  if (address.length < 5 || address.length > 200) {
    errs.push("Street address must be between 5 and 200 characters.");
  }

  const city = str("city");
  if (city.length < 2 || city.length > 80) {
    errs.push("City must be between 2 and 80 characters.");
  }

  const country = str("country");
  if (country.length < 2 || country.length > 80) {
    errs.push("Country must be between 2 and 80 characters.");
  }

  const postal = str("postalCode");
  if (postal.length < 2 || postal.length > 12 || !/^[A-Za-z0-9\- ]+$/.test(postal)) {
    errs.push("Postal code must be 2–12 characters (letters, numbers, spaces, or hyphen).");
  }

  const website = str("website");
  if (website) {
    try {
      const u = new URL(website.startsWith("http") ? website : `https://${website}`);
      if (!["http:", "https:"].includes(u.protocol)) errs.push("Website must start with http:// or https://.");
    } catch {
      errs.push("Website must be a valid URL (or leave it blank).");
    }
  }

  const fb = str("facebook");
  if (fb && fb.length < 4) errs.push("Facebook link is too short (or leave it blank).");
  const ig = str("instagram");
  if (ig && ig.length < 2) errs.push("Instagram handle or URL is too short (or leave it blank).");
  const yt = str("youtube");
  if (yt && yt.length < 2) errs.push("YouTube link is too short (or leave it blank).");
  const tt = str("tiktok");
  if (tt && tt.length < 2) errs.push("TikTok handle or URL is too short (or leave it blank).");

  if (!files.businessLicense) errs.push("Upload a business license document.");
  if (!files.idDocument) errs.push("Upload an ID document (passport or driver license).");

  return errs;
}

function validateInfluencerApplicationFields(
  formData: Record<string, unknown>,
  files: { idDocument: File | null }
): string[] {
  const errs: string[] = [];
  const str = (k: string) => String(formData[k] ?? "").trim();

  const fb = str("facebook");
  const ig = str("instagram");
  const yt = str("youtube");
  const tt = str("tiktok");
  if (!fb && !ig && !yt && !tt) {
    errs.push("Add at least one profile (Facebook, YouTube, TikTok, or Instagram). Website is optional.");
  }

  for (const { key } of VENDOR_ONLINE_PRESENCE_FIELDS) {
    const msg = validateOptionalOnlinePresenceField(key, str(key));
    if (msg) errs.push(msg);
  }

  if (!files.idDocument) errs.push("Upload an ID document (passport or national ID).");

  return errs;
}

function validateVendorApplicationStrict(
  applicationType: VendorApplicationType,
  formData: Record<string, unknown>,
  files: { businessLicense: File | null; idDocument: File | null },
  allowedBusinessTypes: readonly string[]
): string[] {
  const shared = validateSharedApplicationFields(formData);
  if (applicationType === "professional") {
    return [...shared, ...validateProfessionalApplicationFields(formData, files, allowedBusinessTypes)];
  }
  return [...shared, ...validateInfluencerApplicationFields(formData, files)];
}

export function VendorApplicationForm({ onBack, source = "admin" }: VendorApplicationFormProps) {
  const [applicationType, setApplicationType] = useState<VendorApplicationType>("professional");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    // Business Information
    companyName: "",
    businessType: "",
    registrationNumber: "",

    // Contact Person
    contactName: "",
    email: "",
    phone: "",

    // Store Details
    storeName: "",
    storeDescription: "",
    categories: [] as string[],

    // Business Address
    address: "",
    city: "",
    country: "",
    postalCode: "",

    // Bank Information
    bankName: "",
    accountNumber: "",
    accountName: "",

    // Social Links
    website: "",
    facebook: "",
    youtube: "",
    tiktok: "",
    instagram: "",

    // Terms
    agreeToTerms: false,
    acceptPrivacy: false,
  });

  const [files, setFiles] = useState<{
    businessLicense: File | null;
    idDocument: File | null;
  }>({
    businessLicense: null,
    idDocument: null,
  });

  const [emailValidation, setEmailValidation] = useState<{
    checking: boolean;
    error: string;
    valid: boolean;
  }>({ checking: false, error: "", valid: false });
  const emailCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailCheckAbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (emailCheckTimeoutRef.current) clearTimeout(emailCheckTimeoutRef.current);
      emailCheckAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (emailCheckTimeoutRef.current) clearTimeout(emailCheckTimeoutRef.current);
    emailCheckAbortRef.current?.abort();

    const email = String(formData.email || "").trim();
    if (!email || !isValidEmailStrict(email)) {
      setEmailValidation({ checking: false, error: "", valid: false });
      return;
    }

    setEmailValidation({ checking: true, error: "", valid: false });
    emailCheckTimeoutRef.current = setTimeout(async () => {
      const controller = new AbortController();
      emailCheckAbortRef.current = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch(`${API_BASE_URL}/vendors/validate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ email }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!isMountedRef.current || controller.signal.aborted) return;
        if (data.errors?.email) {
          setEmailValidation({ checking: false, error: String(data.errors.email), valid: false });
        } else {
          setEmailValidation({ checking: false, error: "", valid: true });
        }
      } catch (error) {
        if (!isMountedRef.current || emailCheckAbortRef.current !== controller) return;
        const timedOut = error instanceof DOMException && error.name === "AbortError";
        setEmailValidation({
          checking: false,
          error: "",
          valid: timedOut,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    }, 500);
  }, [formData.email]);

  const categoryOptions = [
    "Electronics",
    "Fashion",
    "Home & Garden",
    "Beauty & Health",
    "Sports & Outdoors",
    "Toys & Games",
    "Books & Media",
    "Food & Beverages",
    "Automotive",
    "Other",
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    if (type === "checkbox") {
      setFormData((prev) => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleCategoryToggle = (category: string) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fileType: keyof typeof files) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check initial file size (max 5MB before compression)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File too large", {
          description: "File size must be less than 5MB"
        });
        return;
      }
      
      // Compress the file before storing
      compressFile(file, fileType);
    }
  };

  const compressFile = async (file: File, fileType: keyof typeof files) => {
    try {
      const fileTypeStr = file.type.toLowerCase();
      const imageMaxSizeKB = 500; // Target 500KB for images
      const docMaxSizeKB = 2048; // Target 2MB for documents (PDF, DOC)
      
      // Handle image files - compress to 500KB
      if (fileTypeStr.includes('image')) {
        const compressedFile = await compressImage(file, imageMaxSizeKB);
        setFiles(prev => ({
          ...prev,
          [fileType]: compressedFile
        }));
        
        const sizeKB = (compressedFile.size / 1024).toFixed(0);
        toast.success("File Uploaded", {
          description: `Image compressed to ${sizeKB} KB`
        });
      } 
      // Handle PDF and DOC files - max 2MB
      else if (fileTypeStr.includes('pdf') || fileTypeStr.includes('document') || fileTypeStr.includes('msword') || fileTypeStr.includes('officedocument')) {
        const sizeKB = file.size / 1024;
        const sizeMB = (sizeKB / 1024).toFixed(2);
        
        if (sizeKB > docMaxSizeKB) {
          toast.error("Document too large", {
            description: `File is ${sizeMB} MB. Maximum size is 2 MB.`
          });
          return;
        }
        
        setFiles(prev => ({
          ...prev,
          [fileType]: file
        }));
        
        toast.success("File Uploaded", {
          description: `Document uploaded (${sizeMB} MB)`
        });
      }
      // Other file types - reject
      else {
        toast.error("Invalid file type", {
          description: "Please upload an image, PDF, or DOC file."
        });
        return;
      }
    } catch (error) {
      console.error("File compression error:", error);
      toast.error("Upload Failed", {
        description: "Failed to process file. Please try again."
      });
    }
  };

  const compressImage = (file: File, maxSizeKB: number): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Calculate new dimensions while maintaining aspect ratio
          const maxDimension = 1920; // Max width or height
          if (width > height && width > maxDimension) {
            height = (height * maxDimension) / width;
            width = maxDimension;
          } else if (height > maxDimension) {
            width = (width * maxDimension) / height;
            height = maxDimension;
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          ctx.drawImage(img, 0, 0, width, height);
          
          // Try different quality levels to get under target size
          const tryCompress = (quality: number) => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Failed to compress image'));
                  return;
                }
                
                const sizeKB = blob.size / 1024;
                
                // If still too large and quality can be reduced further, try again
                if (sizeKB > maxSizeKB && quality > 0.1) {
                  tryCompress(quality - 0.1);
                } else {
                  // Create a new File from the blob
                  const compressedFile = new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                  });
                  resolve(compressedFile);
                }
              },
              'image/jpeg',
              quality
            );
          };
          
          // Start with quality 0.8
          tryCompress(0.8);
        };
        
        img.onerror = () => {
          reject(new Error('Failed to load image'));
        };
        
        img.src = e.target?.result as string;
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (fileType: keyof typeof files) => {
    setFiles(prev => ({
      ...prev,
      [fileType]: null
    }));
  };

  const handleApplicationTypeChange = (next: VendorApplicationType) => {
    setApplicationType(next);
    if (next === "influencer") {
      setFiles((prev) => ({ ...prev, businessLicense: null }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validateVendorApplicationStrict(
      applicationType,
      formData,
      files,
      BUSINESS_TYPE_OPTIONS
    );
    if (validationErrors.length > 0) {
      const maxShow = 5;
      const head = validationErrors.slice(0, maxShow);
      const more =
        validationErrors.length > maxShow
          ? `\n… and ${validationErrors.length - maxShow} more.`
          : "";
      toast.error("Please fix the form", {
        description: `${head.join("\n")}${more}`,
        duration: 9000,
      });
      return;
    }

    if (emailValidation.error) {
      toast.error("Email not available", { description: emailValidation.error });
      return;
    }
    if (emailValidation.checking) {
      toast.error("Please wait", { description: "Still checking whether this email is available." });
      return;
    }

    setIsSubmitting(true);

    try {
      const idDocumentBase64 = await fileToBase64(files.idDocument!);
      const businessLicenseBase64 =
        applicationType === "professional" && files.businessLicense
          ? await fileToBase64(files.businessLicense)
          : null;

      const applicationData = {
        ...formData,
        applicationType,
        ...(applicationType === "influencer"
          ? {
              companyName: formData.storeName,
              businessType: "Creator / Influencer",
            }
          : {}),
        files: {
          ...(businessLicenseBase64 && files.businessLicense
            ? {
                businessLicense: {
                  name: files.businessLicense.name,
                  type: files.businessLicense.type,
                  data: businessLicenseBase64,
                },
              }
            : {}),
          idDocument: {
            name: files.idDocument!.name,
            type: files.idDocument!.type,
            data: idDocumentBase64,
          },
        },
        status: "pending",
        submittedAt: new Date().toISOString(),
      };

      const response = await fetch(
        `${API_BASE_URL}/vendor-applications`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(applicationData),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({} as { error?: string; code?: string }));
        const code = String(error.code || "");
        const msg =
          response.status === 409 &&
          (code === "DUPLICATE_PENDING" ||
            code === "VENDOR_EMAIL_TAKEN" ||
            code === "EMAIL_ALREADY_VENDOR")
            ? String(error.error || "This email cannot be used for a new vendor account.")
            : String(error.error || "Failed to submit application");
        throw new Error(msg);
      }

      const result = await response.json();
      console.log("✅ Application submitted:", result);

      try {
        invalidateAdminVendorApplicationsCache();
        notifyAdminVendorApplicationsUpdated("submitted");
      } catch {
        /* non-fatal */
      }

      setIsSubmitted(true);
      toast.success("Application Submitted!", {
        description: "We'll review your application and get back to you within 3-5 business days."
      });
    } catch (error: any) {
      console.error("❌ Application submission error:", error);
      toast.error("Submission Failed", {
        description: error.message || "Please try again later"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Success state
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/40 flex items-center justify-center p-4 sm:p-8">
        <div className="relative w-full max-w-3xl">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-[2rem] bg-gradient-to-br from-amber-200/60 via-orange-100/40 to-slate-200/60 opacity-80 blur-sm"
          />
          <div className="relative bg-white rounded-[1.75rem] shadow-[0_25px_60px_-15px_rgba(15,23,42,0.12)] border border-slate-100/80 px-8 py-12 sm:px-14 sm:py-16 text-center">
            <div className="mx-auto mb-8 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-emerald-50 to-green-100 ring-[10px] ring-emerald-50/80 shadow-inner">
              <CheckCircle2 className="h-14 w-14 text-emerald-600" strokeWidth={1.75} />
            </div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-slate-100/90 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              All set
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-5">
              Application Submitted!
            </h2>
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl mx-auto mb-10">
              Thank you for applying to become a vendor on SECURE. We&apos;ll review your application and get back to you within{" "}
              <span className="font-medium text-slate-800">3–5 business days</span>.
            </p>
            <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/90 border border-orange-100/80 px-6 py-7 sm:px-8 sm:py-8 text-left shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-orange-700/90 mb-3">
                What&apos;s next?
              </p>
              <p className="text-slate-700 text-sm sm:text-base leading-relaxed">
                Our team will verify your{" "}
                {applicationType === "influencer" ? "ID" : "documents"} and contact you via email.
              </p>
              <div className="mt-5 flex items-center gap-3 rounded-xl bg-white/70 border border-orange-100/60 px-4 py-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
                  <Mail className="h-5 w-5" />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-xs font-medium text-slate-500">We&apos;ll reach you at</p>
                  <p className="text-sm sm:text-base font-semibold text-slate-900 truncate">{formData.email}</p>
                </div>
              </div>
            </div>
            <div className="mt-10 flex justify-center">
              <Button
                type="button"
                variant="outline"
                className="h-11 px-6 border-slate-200 text-slate-800 hover:bg-slate-50"
                onClick={() => {
                  if (onBack) {
                    onBack();
                  } else if (typeof window !== "undefined") {
                    window.history.back();
                  }
                }}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {source === "storefront" ? "Back to home" : "Back"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Form state
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-lg sm:text-2xl font-bold text-slate-900">SECURE Vendor Application</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">Join our marketplace today</p>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form noValidate onSubmit={handleSubmit} className="space-y-6">
          {/* Application type toggle */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
            <p className="text-sm font-medium text-slate-700 mb-3">Who is applying?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleApplicationTypeChange("professional")}
                className={`rounded-xl border p-4 text-left transition-all ${
                  applicationType === "professional"
                    ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/80"
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                    <Store className="w-5 h-5 text-orange-600" />
                  </div>
                  <span className="font-semibold text-slate-900">Professional Store</span>
                </div>
                <p className="text-sm text-slate-500">
                  Registered business with company details, address, and business license.
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleApplicationTypeChange("influencer")}
                className={`rounded-xl border p-4 text-left transition-all ${
                  applicationType === "influencer"
                    ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/80"
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                  </div>
                  <span className="font-semibold text-slate-900">Creator / Influencer</span>
                </div>
                <p className="text-sm text-slate-500">
                  Individual seller — no company registration or business license required.
                </p>
              </button>
            </div>
          </div>

          {applicationType === "professional" && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Business Information</h3>
                <p className="text-sm text-slate-500">Tell us about your business</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Company Name *
                </label>
                <input
                  type="text"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleInputChange}
                  required
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="ABC Trading Co."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Business Type *
                </label>
                <select
                  name="businessType"
                  value={formData.businessType}
                  onChange={handleInputChange}
                  required
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                >
                  <option value="">Select type</option>
                  {BUSINESS_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Business Registration Number *
                </label>
                <input
                  type="text"
                  name="registrationNumber"
                  value={formData.registrationNumber}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="123456789"
                />
              </div>
            </div>
          </div>
          )}

          {/* Contact Person */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {applicationType === "influencer" ? "Your Details" : "Contact Person"}
                </h3>
                <p className="text-sm text-slate-500">
                  {applicationType === "influencer"
                    ? "How we can reach you"
                    : "Primary contact information"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  name="contactName"
                  value={formData.contactName}
                  onChange={handleInputChange}
                  required
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className={`w-full h-10 px-4 bg-slate-50 border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all ${
                    emailValidation.error
                      ? "border-red-300 focus:ring-red-500"
                      : emailValidation.valid
                        ? "border-emerald-300"
                        : "border-slate-200"
                  }`}
                  placeholder="john@example.com"
                />
                {emailValidation.checking && (
                  <p className="mt-1 text-xs text-slate-500">Checking email availability…</p>
                )}
                {emailValidation.error && (
                  <p className="mt-1 text-xs text-red-600">{emailValidation.error}</p>
                )}
                {emailValidation.valid && !emailValidation.checking && (
                  <p className="mt-1 text-xs text-emerald-600">Email is available</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  name="phone"
                  inputMode="tel"
                  autoComplete="tel"
                  value={formData.phone}
                  onChange={handleInputChange}
                  aria-required="true"
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="+959XXXXXXXXX or 09XXXXXXXXX"
                />
              </div>
            </div>
          </div>

          {/* Store Details */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Store Details</h3>
                <p className="text-sm text-slate-500">
                  {applicationType === "influencer"
                    ? "Tell us about your shop or brand"
                    : "Information about your store"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Store Name *
                </label>
                <input
                  type="text"
                  name="storeName"
                  value={formData.storeName}
                  onChange={handleInputChange}
                  required
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="My Awesome Store"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Store Description *
                </label>
                <textarea
                  name="storeDescription"
                  value={formData.storeDescription}
                  onChange={handleInputChange}
                  required
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all resize-none"
                  placeholder="Describe what your store sells and what makes it unique..."
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  At least 10 characters (max 5,000).
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Product Categories * (Select at least one)
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                  {categoryOptions.map(category => (
                    <label
                      key={category}
                      className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-all ${
                        formData.categories.includes(category)
                          ? "border-slate-900 bg-slate-50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <Checkbox
                        checked={formData.categories.includes(category)}
                        onCheckedChange={() => handleCategoryToggle(category)}
                      />
                      <span className="text-sm text-slate-700">{category}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {applicationType === "influencer" && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Online Presence</h3>
                <p className="text-sm text-slate-500">Add at least one profile (Facebook, YouTube, TikTok, or Instagram). Website is optional.</p>
              </div>
            </div>

            <VendorOnlinePresenceFormFields
              values={formData}
              onChange={(key, value) => setFormData((prev) => ({ ...prev, [key]: value }))}
            />
          </div>
          )}

          {applicationType === "professional" && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                <MapPin className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Business Address</h3>
                <p className="text-sm text-slate-500">Your business location</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Street Address *
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="123 Main Street"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  City *
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="New York"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Country *
                </label>
                <input
                  type="text"
                  name="country"
                  value={formData.country}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="United States"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Postal Code *
                </label>
                <input
                  type="text"
                  name="postalCode"
                  value={formData.postalCode}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="10001"
                />
              </div>
            </div>
          </div>
          )}

          {/* Bank Information */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Bank Information</h3>
                <p className="text-sm text-slate-500">For receiving payments</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Bank Name *
                </label>
                <input
                  type="text"
                  name="bankName"
                  value={formData.bankName}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="Chase Bank"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Account Holder Name *
                </label>
                <input
                  type="text"
                  name="accountName"
                  value={formData.accountName}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="ABC Trading Co."
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Account Number *
                </label>
                <input
                  type="text"
                  name="accountNumber"
                  value={formData.accountNumber}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="****1234"
                />
              </div>
            </div>
          </div>

          {/* Document Upload */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Required Documents</h3>
                <p className="text-sm text-slate-500">
                  {applicationType === "influencer"
                    ? "Upload a valid ID — images max 500KB, PDF/DOC max 2MB"
                    : "Images (max 500KB), PDF/DOC files (max 2MB)"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {applicationType === "professional" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Business License *
                </label>
                {files.businessLicense ? (
                  <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <FileText className="w-5 h-5 text-green-600" />
                    <span className="flex-1 text-sm text-slate-700">{files.businessLicense.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile("businessLicense")}
                      className="p-1 hover:bg-red-100 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 p-6 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-orange-400 hover:bg-slate-50 transition-all">
                    <Upload className="w-5 h-5 text-slate-400" />
                    <span className="text-sm text-slate-600">Click to upload business license</span>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => handleFileChange(e, "businessLicense")}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
              )}

              {/* ID Document */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {applicationType === "influencer"
                    ? "ID Document (Passport / National ID) *"
                    : "ID Document (Passport/Driver's License) *"}
                </label>
                {files.idDocument ? (
                  <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <FileText className="w-5 h-5 text-green-600" />
                    <span className="flex-1 text-sm text-slate-700">{files.idDocument.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile("idDocument")}
                      className="p-1 hover:bg-red-100 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 p-6 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-orange-400 hover:bg-slate-50 transition-all">
                    <Upload className="w-5 h-5 text-slate-400" />
                    <span className="text-sm text-slate-600">Click to upload ID document</span>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => handleFileChange(e, "idDocument")}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Terms and Conditions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="agreeToTerms"
                checked={formData.agreeToTerms}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, agreeToTerms: checked as boolean }))}
                className="mt-0.5"
              />
              <Label htmlFor="agreeToTerms" className="text-sm text-slate-700 cursor-pointer font-normal">
                Agree to the Terms and Conditions
              </Label>
            </div>
            
            <div className="flex items-start gap-3">
              <Checkbox
                id="acceptPrivacy"
                checked={formData.acceptPrivacy}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, acceptPrivacy: checked as boolean }))}
                className="mt-0.5"
              />
              <Label htmlFor="acceptPrivacy" className="text-sm text-slate-700 cursor-pointer font-normal">
                Accept Privacy Policy
              </Label>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex flex-col sm:flex-row gap-4">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="w-48 px-6 py-3 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:flex-1 h-12 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Application"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}