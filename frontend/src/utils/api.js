/**
 * Utility to safely handle API requests and response parsing.
 * Prevents DOMException: "Failed to execute 'json' on 'Response': Unexpected end of JSON input"
 */

export async function parseResponseJson(response) {
  const text = await response.text();

  if (!text || !text.trim()) {
    if (!response.ok) {
      throw new Error(`Server returned error status ${response.status}${response.statusText ? ` (${response.statusText})` : ''}.`);
    }
    return {};
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    if (!response.ok) {
      const snippet = text.replace(/<[^>]*>?/gm, '').trim().substring(0, 120);
      throw new Error(`Server error (${response.status}): ${snippet || response.statusText || 'Unexpected error'}`);
    }
    throw new Error('Received non-JSON response from server.');
  }

  if (!response.ok) {
    let errorMsg = data && (data.error || data.message)
      ? (data.error || data.message)
      : `Request failed with status ${response.status}`;

    if (response.status === 403 && typeof errorMsg === 'string' && errorMsg.toLowerCase().includes('license inactive')) {
      errorMsg = 'Service temporarily unavailable. Please contact your system provider.';
    }

    if (response.status === 403 && typeof errorMsg === 'string' && (errorMsg.toLowerCase().includes('suspended') || errorMsg.toLowerCase().includes('expired'))) {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('tenant-suspended', { detail: errorMsg }));
      }
    }

    throw new Error(errorMsg);
  }

  return data;
}

export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export function getApiUrl(endpoint) {
  if (!endpoint) return '';
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const base = API_BASE_URL.replace(/\/+$/, '');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return base ? `${base}${path}` : path;
}

export async function safeFetch(url, options = {}) {
  try {
    const fullUrl = getApiUrl(url);
    const headers = { ...(options.headers || {}) };
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (token && !headers['Authorization'] && !headers['authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(fullUrl, { ...options, headers });
    return await parseResponseJson(response);
  } catch (err) {
    if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
      throw new Error('Unable to connect to backend server. Please verify the backend service is running.');
    }
    throw err;
  }
}
