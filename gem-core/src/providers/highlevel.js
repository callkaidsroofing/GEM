/**
 * HighLevel/LeadConnector Provider
 *
 * Provides standardized access to HighLevel API for contact sync.
 * Uses HIGHLEVEL_PRIVATE_API_KEY and HIGHLEVEL_LOCATION_ID from environment.
 *
 * API Base: https://services.leadconnectorhq.com
 *
 * SECURITY: Never log, print, or expose API keys in any output.
 */

import crypto from 'crypto';

// Configuration from environment
const HIGHLEVEL_BASE_URL = process.env.HIGHLEVEL_BASE_URL || 'https://services.leadconnectorhq.com';
const HIGHLEVEL_API_VERSION = '2021-07-28';
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Check if HighLevel integration is configured
 * @returns {{ configured: boolean, missing: string[] }}
 */
export function checkConfiguration() {
  const required = ['HIGHLEVEL_PRIVATE_API_KEY', 'HIGHLEVEL_LOCATION_ID'];
  const missing = required.filter(key => !process.env[key]);
  
  return {
    configured: missing.length === 0,
    missing,
    required
  };
}

/**
 * Get authorization headers for HighLevel API
 * SECURITY: Headers are built but never logged
 * @returns {Object} Headers object
 */
function getAuthHeaders() {
  return {
    'Authorization': `Bearer ${process.env.HIGHLEVEL_PRIVATE_API_KEY}`,
    'Version': HIGHLEVEL_API_VERSION,
    'Content-Type': 'application/json'
  };
}

/**
 * Make an authenticated request to HighLevel API
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {Object} options - Request options
 * @param {Object} options.body - Request body for POST/PUT
 * @param {Object} options.params - URL query parameters
 * @param {number} options.timeout - Request timeout in ms
 * @returns {Promise<{ success: boolean, data?: any, error?: string, status?: number }>}
 */
async function request(method, endpoint, options = {}) {
  const { body, params, timeout = DEFAULT_TIMEOUT_MS } = options;
  
  // Build URL with query params
  let url = `${HIGHLEVEL_BASE_URL}${endpoint}`;
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    url += `?${searchParams.toString()}`;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    // Parse response
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    if (!response.ok) {
      return {
        success: false,
        error: typeof data === 'object' ? (data.message || data.error || 'API error') : 'API error',
        status: response.status
      };
    }
    
    return {
      success: true,
      data,
      status: response.status
    };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: `Request timeout after ${timeout}ms`,
        status: 408
      };
    }
    
    return {
      success: false,
      error: error.message || 'Network error',
      status: 0
    };
  }
}

/**
 * Health check - verify API connectivity and location access
 * @returns {Promise<{ success: boolean, data?: { api: boolean }, error?: string }>}
 */
export async function healthCheck() {
  const config = checkConfiguration();
  if (!config.configured) {
    return {
      success: false,
      error: 'HighLevel integration not configured',
      missing: config.missing
    };
  }
  
  const locationId = process.env.HIGHLEVEL_LOCATION_ID;
  
  // Try to fetch location info to verify access
  const result = await request('GET', `/locations/${locationId}`);
  
  if (result.success) {
    return {
      success: true,
      data: {
        api: true,
        location_name: result.data?.name || 'Unknown'
      }
    };
  }
  
  return {
    success: false,
    error: result.error,
    data: {
      api: false
    }
  };
}

/**
 * Fetch contacts from HighLevel with pagination
 * @param {Object} options - Fetch options
 * @param {string} options.locationId - Location ID (defaults to env)
 * @param {string} options.cursor - Pagination cursor (startAfterId)
 * @param {string} options.since - ISO timestamp for updated contacts
 * @param {number} options.limit - Number of contacts per page (max 200)
 * @returns {Promise<{ success: boolean, data?: { contacts: Array, meta: Object }, error?: string }>}
 */
export async function fetchContacts(options = {}) {
  const config = checkConfiguration();
  if (!config.configured) {
    return {
      success: false,
      error: 'HighLevel integration not configured',
      missing: config.missing
    };
  }
  
  const {
    locationId = process.env.HIGHLEVEL_LOCATION_ID,
    cursor,
    since,
    limit = 100
  } = options;
  
  // Build query parameters
  const params = {
    locationId,
    limit: Math.min(limit, 200)
  };
  
  // Add cursor for pagination
  if (cursor) {
    params.startAfterId = cursor;
  }
  
  // Add since filter for incremental sync
  // Note: HighLevel uses startAfter for date filtering in some endpoints
  // The exact parameter depends on the API version
  if (since) {
    params.startAfter = since;
  }
  
  const result = await request('GET', '/contacts/', { params });
  
  if (result.success) {
    const contacts = result.data?.contacts || [];
    const meta = result.data?.meta || {};
    
    return {
      success: true,
      data: {
        contacts,
        meta: {
          total: meta.total || contacts.length,
          nextPageUrl: meta.nextPageUrl || null,
          startAfterId: meta.startAfterId || null,
          // Extract cursor from next page URL if available
          nextCursor: extractCursorFromUrl(meta.nextPageUrl)
        }
      }
    };
  }
  
  return {
    success: false,
    error: result.error
  };
}

/**
 * Extract cursor/startAfterId from HighLevel pagination URL
 * @param {string} url - Next page URL from API response
 * @returns {string|null}
 */
function extractCursorFromUrl(url) {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('startAfterId') || 
           urlObj.searchParams.get('startAfter') ||
           null;
  } catch {
    return null;
  }
}

/**
 * Compute SHA-256 hash of contact payload for change detection
 * @param {Object} payload - Contact payload
 * @returns {string} Hex-encoded hash
 */
export function computePayloadHash(payload) {
  // Sort keys for consistent hashing
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Get a single contact by ID
 * @param {string} contactId - HighLevel contact ID
 * @returns {Promise<{ success: boolean, data?: Object, error?: string }>}
 */
export async function getContact(contactId) {
  const config = checkConfiguration();
  if (!config.configured) {
    return {
      success: false,
      error: 'HighLevel integration not configured',
      missing: config.missing
    };
  }
  
  return request('GET', `/contacts/${contactId}`);
}

export default {
  checkConfiguration,
  healthCheck,
  fetchContacts,
  getContact,
  computePayloadHash
};
