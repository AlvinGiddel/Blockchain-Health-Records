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
    const errorMsg = data && (data.error || data.message)
      ? (data.error || data.message)
      : `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data;
}

export async function safeFetch(url, options = {}) {
  try {
    const response = await fetch(url, options);
    return await parseResponseJson(response);
  } catch (err) {
    if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
      throw new Error('Unable to connect to backend server. Please verify the backend service is running.');
    }
    throw err;
  }
}
