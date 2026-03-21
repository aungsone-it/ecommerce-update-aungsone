import { useState } from 'react';
import { Button } from './ui/button';
import { Trash2, RefreshCw } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

export function TestDataManager() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const clearAllUsers = async () => {
    if (!confirm('⚠️ WARNING: This will delete ALL customer accounts. Are you sure?')) {
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/admin/clear-test-data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({ confirmDelete: true })
        }
      );

      const data = await response.json();

      if (response.ok) {
        setMessage(`✅ Success: ${data.message || 'All test data cleared'}`);
      } else {
        setMessage(`❌ Error: ${data.error || 'Failed to clear data'}`);
      }
    } catch (error) {
      console.error('Error clearing test data:', error);
      setMessage(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-xl p-4 border border-slate-200 max-w-sm z-50">
      <h3 className="text-sm font-semibold text-slate-900 mb-2">🔧 Test Data Manager</h3>
      <p className="text-xs text-slate-600 mb-3">
        Use this tool to clear all customer accounts for testing purposes.
      </p>
      
      <Button
        onClick={clearAllUsers}
        disabled={loading}
        variant="destructive"
        size="sm"
        className="w-full"
      >
        {loading ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Clearing...
          </>
        ) : (
          <>
            <Trash2 className="w-4 h-4 mr-2" />
            Clear All Users
          </>
        )}
      </Button>

      {message && (
        <div className={`mt-3 text-xs p-2 rounded ${
          message.startsWith('✅') 
            ? 'bg-green-50 text-green-700 border border-green-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message}
        </div>
      )}
    </div>
  );
}