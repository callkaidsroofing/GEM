/**
 * GEM Scalable Worker Implementation
 *
 * Provides horizontal scaling support for the GEM executor.
 * Multiple workers can run simultaneously, safely claiming jobs
 * via atomic database operations.
 *
 * Features:
 * - Unique worker identification
 * - Graceful shutdown handling
 * - Health monitoring and metrics
 * - Backoff on empty queue
 * - Concurrent job limit per worker
 */

import { v4 as uuid } from 'uuid';
import { supabase } from './supabase.js';
import { initializeRealtime, cleanupRealtime } from './realtime.js';

/**
 * Worker configuration
 */
const DEFAULT_CONFIG = {
  pollIntervalMs: parseInt(process.env.TOOLS_POLL_INTERVAL_MS) || 5000,
  maxConcurrent: parseInt(process.env.WORKER_MAX_CONCURRENT) || 1,
  emptyQueueBackoffMs: 10000,
  maxBackoffMs: 60000,
  shutdownTimeoutMs: 30000,
  healthCheckIntervalMs: 60000,
};

/**
 * Worker state
 */
class WorkerState {
  constructor(workerId) {
    this.workerId = workerId;
    this.isRunning = false;
    this.isShuttingDown = false;
    this.activeJobs = new Map();
    this.metrics = {
      startedAt: null,
      jobsClaimed: 0,
      jobsCompleted: 0,
      jobsFailed: 0,
      totalProcessingTimeMs: 0,
      lastJobAt: null,
      consecutiveEmptyPolls: 0,
    };
  }

  get activeJobCount() {
    return this.activeJobs.size;
  }

  get canAcceptJob() {
    return this.isRunning && !this.isShuttingDown && this.activeJobCount < DEFAULT_CONFIG.maxConcurrent;
  }
}

/**
 * Generate unique worker ID
 * Includes instance info for debugging in multi-instance deployments
 */
function generateWorkerId() {
  const instanceId = process.env.RENDER_INSTANCE_ID ||
                     process.env.DYNO ||
                     process.env.HOSTNAME ||
                     'local';
  return `worker-${instanceId}-${uuid().slice(0, 8)}`;
}

/**
 * Create a new worker instance
 */
export function createWorker(config = {}) {
  const workerConfig = { ...DEFAULT_CONFIG, ...config };
  const workerId = generateWorkerId();
  const state = new WorkerState(workerId);

  let pollTimeout = null;
  let healthCheckInterval = null;

  /**
   * Claim the next available job
   */
  async function claimJob() {
    if (!state.canAcceptJob) {
      return null;
    }

    try {
      const { data: job, error } = await supabase.rpc('claim_next_core_tool_call', {
        p_worker_id: workerId,
      });

      if (error) {
        console.error(`[${workerId}] Claim error:`, error);
        return null;
      }

      if (job) {
        state.metrics.jobsClaimed++;
        state.metrics.lastJobAt = new Date();
        state.metrics.consecutiveEmptyPolls = 0;
        state.activeJobs.set(job.id, {
          ...job,
          claimedAt: Date.now(),
        });
        console.info(`[${workerId}] Claimed job: ${job.id} (${job.tool_name})`);
      } else {
        state.metrics.consecutiveEmptyPolls++;
      }

      return job;
    } catch (error) {
      console.error(`[${workerId}] Claim exception:`, error);
      return null;
    }
  }

  /**
   * Execute a job with the appropriate handler
   */
  async function executeJob(job, executeHandler) {
    const startTime = Date.now();

    try {
      const result = await executeHandler(job);

      state.metrics.jobsCompleted++;
      state.metrics.totalProcessingTimeMs += Date.now() - startTime;

      console.info(`[${workerId}] Completed job: ${job.id} (${Date.now() - startTime}ms)`);
      return result;
    } catch (error) {
      state.metrics.jobsFailed++;
      state.metrics.totalProcessingTimeMs += Date.now() - startTime;

      console.error(`[${workerId}] Job failed: ${job.id}`, error);
      throw error;
    } finally {
      state.activeJobs.delete(job.id);
    }
  }

  /**
   * Calculate poll interval with backoff
   */
  function getPollInterval() {
    if (state.metrics.consecutiveEmptyPolls === 0) {
      return workerConfig.pollIntervalMs;
    }

    // Exponential backoff with max
    const backoff = Math.min(
      workerConfig.emptyQueueBackoffMs * Math.pow(1.5, state.metrics.consecutiveEmptyPolls - 1),
      workerConfig.maxBackoffMs
    );

    return backoff;
  }

  /**
   * Main poll loop
   */
  async function poll(executeHandler) {
    if (!state.isRunning || state.isShuttingDown) {
      return;
    }

    try {
      // Claim and execute job if capacity available
      if (state.canAcceptJob) {
        const job = await claimJob();
        if (job) {
          // Execute asynchronously (don't block polling)
          executeJob(job, executeHandler).catch(error => {
            console.error(`[${workerId}] Unhandled execution error:`, error);
          });
        }
      }
    } catch (error) {
      console.error(`[${workerId}] Poll error:`, error);
    }

    // Schedule next poll
    const interval = getPollInterval();
    pollTimeout = setTimeout(() => poll(executeHandler), interval);
  }

  /**
   * Start the worker
   */
  async function start(executeHandler) {
    if (state.isRunning) {
      console.warn(`[${workerId}] Already running`);
      return;
    }

    console.info(`[${workerId}] Starting worker...`);
    console.info(`[${workerId}] Config: poll=${workerConfig.pollIntervalMs}ms, maxConcurrent=${workerConfig.maxConcurrent}`);

    state.isRunning = true;
    state.metrics.startedAt = new Date();

    // Initialize realtime subscriptions
    try {
      await initializeRealtime();
    } catch (error) {
      console.warn(`[${workerId}] Realtime init failed (non-fatal):`, error.message);
    }

    // Start health check
    healthCheckInterval = setInterval(() => {
      console.info(`[${workerId}] Health:`, getHealth());
    }, workerConfig.healthCheckIntervalMs);

    // Start polling
    poll(executeHandler);

    console.info(`[${workerId}] Worker started`);

    // Setup graceful shutdown
    setupShutdownHandlers();
  }

  /**
   * Stop the worker gracefully
   */
  async function stop() {
    if (!state.isRunning || state.isShuttingDown) {
      return;
    }

    console.info(`[${workerId}] Shutting down...`);
    state.isShuttingDown = true;

    // Stop polling
    if (pollTimeout) {
      clearTimeout(pollTimeout);
      pollTimeout = null;
    }

    // Stop health check
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }

    // Wait for active jobs to complete
    if (state.activeJobCount > 0) {
      console.info(`[${workerId}] Waiting for ${state.activeJobCount} active jobs...`);

      const shutdownDeadline = Date.now() + workerConfig.shutdownTimeoutMs;

      while (state.activeJobCount > 0 && Date.now() < shutdownDeadline) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (state.activeJobCount > 0) {
        console.warn(`[${workerId}] Shutdown timeout - ${state.activeJobCount} jobs abandoned`);
      }
    }

    // Cleanup realtime
    try {
      await cleanupRealtime();
    } catch (error) {
      console.warn(`[${workerId}] Realtime cleanup failed:`, error.message);
    }

    state.isRunning = false;
    console.info(`[${workerId}] Worker stopped`);
  }

  /**
   * Setup process signal handlers for graceful shutdown
   */
  function setupShutdownHandlers() {
    const shutdown = async (signal) => {
      console.info(`[${workerId}] Received ${signal}`);
      await stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Get worker health and metrics
   */
  function getHealth() {
    const uptime = state.metrics.startedAt
      ? Date.now() - state.metrics.startedAt.getTime()
      : 0;

    const avgProcessingTime = state.metrics.jobsCompleted > 0
      ? Math.round(state.metrics.totalProcessingTimeMs / state.metrics.jobsCompleted)
      : 0;

    return {
      workerId,
      status: state.isShuttingDown ? 'shutting_down' : state.isRunning ? 'running' : 'stopped',
      uptime_ms: uptime,
      uptime_human: formatDuration(uptime),
      active_jobs: state.activeJobCount,
      max_concurrent: workerConfig.maxConcurrent,
      metrics: {
        jobs_claimed: state.metrics.jobsClaimed,
        jobs_completed: state.metrics.jobsCompleted,
        jobs_failed: state.metrics.jobsFailed,
        avg_processing_time_ms: avgProcessingTime,
        success_rate: state.metrics.jobsClaimed > 0
          ? ((state.metrics.jobsCompleted / state.metrics.jobsClaimed) * 100).toFixed(1) + '%'
          : 'N/A',
        last_job_at: state.metrics.lastJobAt?.toISOString() || null,
        consecutive_empty_polls: state.metrics.consecutiveEmptyPolls,
      },
    };
  }

  /**
   * Format duration in human-readable form
   */
  function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  return {
    workerId,
    start,
    stop,
    getHealth,
    getState: () => ({ ...state }),
  };
}

/**
 * Create and start a worker
 * Convenience function for simple deployments
 */
export async function startWorker(executeHandler, config = {}) {
  const worker = createWorker(config);
  await worker.start(executeHandler);
  return worker;
}

export default {
  createWorker,
  startWorker,
  generateWorkerId,
};
