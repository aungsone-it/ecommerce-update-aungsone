import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { UserCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { AuthModal } from "./AuthModal";
import { VendorStorefrontFullSkeleton } from "./SkeletonLoaders";
import { useAuth } from "../contexts/AuthContext";
import { authApi } from "../../utils/api";
import { MIGOO_USER_SESSION_CHANGED_EVENT, notifyMigooUserSessionChanged } from "../../constants";
import { hasKpaySummaryReturnContext } from "../utils/vendorCheckoutPaths";

function readMigooCustomer(): { id: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("migoo-user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed?.id ? { id: parsed.id } : null;
  } catch {
    return null;
  }
}

export function UnifiedKpaySummarySignInGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user: authUser, loading: authLoading } = useAuth();
  const allowGuestSummary = useMemo(
    () =>
      hasKpaySummaryReturnContext({
        pathname: location.pathname,
        search: location.search,
      }),
    [location.pathname, location.search],
  );
  const [migooUser, setMigooUser] = useState(readMigooCustomer);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    name: "",
    phone: "",
  });
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  useEffect(() => {
    const sync = () => setMigooUser(readMigooCustomer());
    sync();
    window.addEventListener(MIGOO_USER_SESSION_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MIGOO_USER_SESSION_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const signedIn = Boolean(migooUser?.id || authUser?.id);

  useEffect(() => {
    if (allowGuestSummary) {
      setShowAuthModal(false);
      return;
    }
    if (!authLoading && !signedIn) {
      setShowAuthModal(true);
    }
  }, [authLoading, signedIn, allowGuestSummary]);

  if (allowGuestSummary) {
    return <>{children}</>;
  }

  const handleLogin = async () => {
    if (!authForm.email || !authForm.password) {
      toast.error("Please enter email and password");
      return;
    }
    setIsAuthLoading(true);
    try {
      const response = await authApi.login(authForm.email, authForm.password);
      localStorage.setItem("migoo-user", JSON.stringify(response.user));
      notifyMigooUserSessionChanged();
      setMigooUser(readMigooCustomer());
      toast.success(`Welcome back, ${response.user.name || response.user.email}!`);
      setShowAuthModal(false);
      setAuthForm({ email: "", password: "", name: "", phone: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleRegister = async (profileImage?: string) => {
    if (!authForm.password || !authForm.name || !authForm.phone.trim()) {
      toast.error("Please enter your name, phone number, and password");
      return;
    }
    setIsAuthLoading(true);
    try {
      const response = await authApi.register(
        authForm.email.trim() || undefined,
        authForm.password,
        authForm.name,
        authForm.phone.trim(),
        profileImage,
      );
      localStorage.setItem("migoo-user", JSON.stringify(response.user));
      notifyMigooUserSessionChanged();
      setMigooUser(readMigooCustomer());
      toast.success("Account created successfully!");
      setShowAuthModal(false);
      setAuthForm({ email: "", password: "", name: "", phone: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setIsAuthLoading(false);
    }
  };

  if (authLoading) {
    return <VendorStorefrontFullSkeleton />;
  }

  if (!signedIn) {
    return (
      <>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="py-12 text-center space-y-6">
              <UserCircle className="w-16 h-16 text-slate-300 mx-auto" />
              <div>
                <h2 className="text-xl font-bold text-slate-900">Sign in required</h2>
                <p className="text-slate-600 mt-2 text-sm">
                  Sign in to view your order summary after KBZPay payment.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  className="bg-slate-900 hover:bg-slate-800 text-white"
                  onClick={() => {
                    setAuthMode("login");
                    setShowAuthModal(true);
                  }}
                >
                  Sign In
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAuthMode("register");
                    setShowAuthModal(true);
                  }}
                >
                  Register
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          mode={authMode}
          onModeChange={setAuthMode}
          formData={authForm}
          onFormChange={(field, value) => setAuthForm((prev) => ({ ...prev, [field]: value }))}
          onLogin={handleLogin}
          onRegister={handleRegister}
          isLoading={isAuthLoading}
        />
      </>
    );
  }

  return <>{children}</>;
}
