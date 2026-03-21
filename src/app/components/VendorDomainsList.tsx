import { useState, useEffect } from "react";
import { Globe, CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";

interface VendorDomain {
  vendorId: string;
  vendorName: string;
  customDomain: string;
  domainStatus: 'none' | 'pending' | 'verified' | 'active';
  dnsVerified: boolean;
}

export function VendorDomainsList() {
  const [domains, setDomains] = useState<VendorDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadVendorDomains();
  }, []);

  const loadVendorDomains = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/admin/vendor-domains`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setDomains(data.domains || []);
      }
    } catch (error) {
      console.error("Failed to load vendor domains:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadVendorDomains();
    setRefreshing(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
      case 'active':
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
            <CheckCircle className="w-3 h-3" />
            Verified
          </span>
        );
      case 'pending':
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
            <AlertCircle className="w-3 h-3" />
            Pending
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-slate-200 text-slate-600 font-medium">
            <XCircle className="w-3 h-3" />
            Not Set
          </span>
        );
    }
  };

  if (loading) {
    return (
      <Card className="p-6 border-slate-200">
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
      </Card>
    );
  }

  const domainsWithCustom = domains.filter(d => d.customDomain);

  return (
    <Card className="p-6 border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">Vendor Custom Domains</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {domainsWithCustom.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <Globe className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-sm">No vendors have configured custom domains yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {domainsWithCustom.map((vendor) => (
            <div
              key={vendor.vendorId}
              className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200"
            >
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">{vendor.vendorName}</h3>
                <p className="text-sm text-slate-600 mt-1 font-mono">{vendor.customDomain}</p>
              </div>
              <div>
                {getStatusBadge(vendor.domainStatus)}
              </div>
            </div>
          ))}
        </div>
      )}

      {domainsWithCustom.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <p className="text-xs text-slate-500">
            Total custom domains: {domainsWithCustom.length} | 
            Verified: {domainsWithCustom.filter(d => d.domainStatus === 'verified' || d.domainStatus === 'active').length} | 
            Pending: {domainsWithCustom.filter(d => d.domainStatus === 'pending').length}
          </p>
        </div>
      )}
    </Card>
  );
}
