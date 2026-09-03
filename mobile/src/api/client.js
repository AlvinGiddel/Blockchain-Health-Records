import { getAuthToken } from '../storage/secureVault';

// Default to live Vercel backend. Can be configured to local LAN IP if desired.
export const BASE_API_URL = 'https://blockchainrecords.vercel.app/api';

/**
 * Universal Mobile API Client
 */
export async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_API_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  
  const token = await getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers || {})
  };

  if (token && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (parseErr) {
      if (!response.ok) {
        throw new Error(`Server returned error (${response.status}): ${response.statusText}`);
      }
      throw new Error('Received non-JSON response from server.');
    }

    if (!response.ok) {
      const errorMsg = data?.error || data?.message || `Request failed with status ${response.status}`;
      throw new Error(errorMsg);
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
      throw new Error('Unable to connect to blockchain server. Please check internet connection.');
    }
    throw err;
  }
}
