/**
 * GEM Integration Base Class
 *
 * Provides standardized patterns for external service integrations.
 * All integrations should extend this class for consistent behavior.
 */

import { IntegrationError, ErrorCodes } from '../errors.js';

/**
 * Base class for all GEM integrations
 */
export class IntegrationBase {
  /**
   * @param {string} name - Integration name (e.g., 'GoHighLevel', 'Twilio')
   * @param {Object} config - Integration configuration
   * @param {string[]} config.required_env - Required environment variables
   * @param {string} config.base_url - Base URL for API calls
   * @param {number} config.timeout_ms - Request timeout (default: 30000)
   * @param {number} config.max_retries - Max retry attempts (default: 3)
   */
  constructor(name, config) {
    this.name = name;
    this.config = {
      required_env: [],
      base_url: '',
      timeout_ms: 30000,
      max_retries: 3,
      ...config,
    };
    this.configured = this.checkConfiguration();
    this.metrics = {
      calls: 0,
      successes: 0,
      failures: 0,
      totalLatencyMs: 0,
    };
  }

  /**
   * Check if all required environment variables are set
   */
  checkConfiguration() {
    const missing = this.config.required_env.filter(key => !process.env[key]);
    if (missing.length > 0) {
      this.missingEnv = missing;
      return false;
    }
    return true;
  }

  /**
   * Get configuration status for not_configured responses
   */
  getConfigurationStatus() {
    return {
      configured: this.configured,
      integration: this.name,
      required_env: this.config.required_env,
      missing_env: this.missingEnv || [],
    };
  }

  /**
   * Return a not_configured receipt if integration is not set up
   */
  notConfiguredReceipt(operation) {
    return {
      status: 'not_configured',
      result: {
        status: 'not_configured',
        reason: `${this.name} integration not configured for ${operation}`,
        required_env: this.config.required_env,
        missing_env: this.missingEnv || [],
        next_steps: this.config.required_env.map(env => `Set ${env} environment variable`),
      },
      effects: {},
    };
  }

  /**
   * Make an authenticated API request
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint (appended to base_url)
   * @param {Object} data - Request body (for POST/PUT)
   * @param {Object} options - Additional options
   */
  async call(method, endpoint, data = null, options = {}) {
    if (!this.configured) {
      return {
        status: 'not_configured',
        reason: `${this.name} integration not configured`,
        required_env: this.config.required_env,
      };
    }

    const startTime = Date.now();
    this.metrics.calls++;

    try {
      const response = await this.makeRequest(method, endpoint, data, options);
      this.metrics.successes++;
      this.metrics.totalLatencyMs += Date.now() - startTime;

      return {
        status: 'succeeded',
        data: response,
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      this.metrics.failures++;
      this.metrics.totalLatencyMs += Date.now() - startTime;

      return {
        status: 'failed',
        error: error.message,
        code: error.code || ErrorCodes.INTEGRATION_API_ERROR,
        latency_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Make the actual HTTP request - override in subclasses
   */
  async makeRequest(method, endpoint, data, options) {
    const url = `${this.config.base_url}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
      ...options.headers,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout_ms);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new IntegrationError(this.name, `API returned ${response.status}: ${response.statusText}`, response.status);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeout);

      if (error.name === 'AbortError') {
        throw new IntegrationError(this.name, `Request timed out after ${this.config.timeout_ms}ms`, 408);
      }

      throw error;
    }
  }

  /**
   * Get authentication headers - override in subclasses
   */
  getAuthHeaders() {
    return {};
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics() {
    return {
      integration: this.name,
      configured: this.configured,
      ...this.metrics,
      avg_latency_ms: this.metrics.calls > 0 ? Math.round(this.metrics.totalLatencyMs / this.metrics.calls) : 0,
      success_rate: this.metrics.calls > 0 ? (this.metrics.successes / this.metrics.calls * 100).toFixed(1) + '%' : 'N/A',
    };
  }

  /**
   * Retry wrapper with exponential backoff
   */
  async withRetry(fn, maxRetries = this.config.max_retries) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Don't retry on auth errors or validation errors
        if (error.code === ErrorCodes.INTEGRATION_AUTH_FAILED) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s, ...
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}

/**
 * Registry of all available integrations
 */
export const IntegrationRegistry = {
  integrations: {},

  register(name, integration) {
    this.integrations[name] = integration;
  },

  get(name) {
    return this.integrations[name];
  },

  getAll() {
    return Object.entries(this.integrations).map(([name, integration]) => ({
      name,
      configured: integration.configured,
      metrics: integration.getMetrics(),
    }));
  },

  getConfigurationReport() {
    return Object.entries(this.integrations).map(([name, integration]) => ({
      name,
      ...integration.getConfigurationStatus(),
    }));
  },
};
