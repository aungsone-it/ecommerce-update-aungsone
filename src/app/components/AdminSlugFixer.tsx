import { useState } from "react";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";

export function AdminSlugFixer() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFixSlugs = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/admin/fix-vendor-slugs`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fix slugs: ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data);
      console.log("✅ Slug fix result:", data);
    } catch (err: any) {
      console.error("❌ Error fixing slugs:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold mb-4">🔧 Admin: Fix Vendor Slugs</h1>
        <p className="text-gray-600 mb-6">
          This tool will create/update slug mappings for all vendors in the database,
          ensuring that vendor storefronts can be accessed by their businessName slug.
        </p>

        <button
          onClick={handleFixSlugs}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? "Fixing Slugs..." : "Fix All Vendor Slugs"}
        </button>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <h3 className="font-semibold text-red-800 mb-2">❌ Error</h3>
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {result && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="font-semibold text-green-800 mb-2">
              ✅ Success! Processed {result.processed} vendors
            </h3>
            
            <div className="mt-4 max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Vendor ID</th>
                    <th className="px-3 py-2 text-left">Business Name</th>
                    <th className="px-3 py-2 text-left">Slug</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results?.map((r: any, idx: number) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{r.vendorId}</td>
                      <td className="px-3 py-2">{r.businessName}</td>
                      <td className="px-3 py-2 font-mono text-blue-600">{r.slug}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            r.status === "created"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded">
              <p className="text-sm text-blue-800">
                <strong>Next step:</strong> Try accessing your vendor storefront at{" "}
                <code className="bg-blue-100 px-2 py-1 rounded">/vendor/[slug]</code>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}