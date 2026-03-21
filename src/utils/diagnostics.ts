import { projectId, publicAnonKey } from '../../utils/supabase/info';

export async function testConnection() {
  const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f`;
  
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Connection successful:', data);
      return { success: true, data };
    } else {
      console.error('❌ Connection failed:', response.status, response.statusText);
      return { success: false, status: response.status };
    }
  } catch (error) {
    console.error('❌ Connection error:', error);
    return { success: false, error };
  }
}

export async function testEndpoint(endpoint: string, method = 'GET', body?: any) {
  const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f`;
  
  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${baseUrl}${endpoint}`, options);
    const data = await response.json();
    
    console.log(`${method} ${endpoint}:`, response.status, data);
    return { success: response.ok, status: response.status, data };
  } catch (error) {
    console.error(`Error testing ${endpoint}:`, error);
    return { success: false, error };
  }
}
