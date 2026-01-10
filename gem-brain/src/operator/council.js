/**
 * CKR-GEM Council Deliberation System
 *
 * Implements the High Council "Multi-Persona Deliberation" pattern.
 * Provides checks and balances through 7 distinct personas that
 * evaluate operations from different perspectives.
 *
 * Personas:
 * - ARCHITECT: System design and single source of truth
 * - CRITIC: Safety and risk assessment
 * - PLANNER: Systematic ordering and dependencies
 * - ENGINEER: Working code and contract compliance
 * - INSPECTOR: Evidence and proof requirements
 * - REFINER: User experience and communication
 * - SHIPPER: Delivery speed and monitoring
 *
 * Features:
 * - Fast-path for T0/T1 operations (skip council)
 * - Full deliberation for T2+ operations
 * - Consensus building with blocking/warning system
 * - Audit trail for decisions
 */

/**
 * Council Personas with their biases and safeguards
 */
export const COUNCIL_PERSONAS = {
  ARCHITECT: {
    id: 'ARCHITECT',
    name: 'System Architect',
    bias: 'Single source of truth, clean design',
    safeguard: 'Reject messy fixes and workarounds',
    concerns: ['schema_consistency', 'data_integrity', 'system_design'],
    blockingPriority: 'high'
  },
  CRITIC: {
    id: 'CRITIC',
    name: 'Security Critic',
    bias: 'Paranoid, safety-obsessed',
    safeguard: 'Never delete without backup, never expose secrets',
    concerns: ['data_loss', 'security', 'irreversibility'],
    blockingPriority: 'critical'
  },
  PLANNER: {
    id: 'PLANNER',
    name: 'Operations Planner',
    bias: 'Systematic ordering, dependency tracking',
    safeguard: 'Never skip dependencies or prerequisites',
    concerns: ['dependencies', 'ordering', 'prerequisites'],
    blockingPriority: 'high'
  },
  ENGINEER: {
    id: 'ENGINEER',
    name: 'Implementation Engineer',
    bias: 'Working code first, pragmatic solutions',
    safeguard: 'Contract compliance, testable outcomes',
    concerns: ['implementation', 'testing', 'contracts'],
    blockingPriority: 'medium'
  },
  INSPECTOR: {
    id: 'INSPECTOR',
    name: 'Quality Inspector',
    bias: 'Skeptical of claims, evidence-based',
    safeguard: 'Require proof for assertions',
    concerns: ['evidence', 'verification', 'proof'],
    blockingPriority: 'medium'
  },
  REFINER: {
    id: 'REFINER',
    name: 'UX Refiner',
    bias: 'User experience, clear communication',
    safeguard: 'Maintain professional tone, avoid confusion',
    concerns: ['communication', 'user_experience', 'clarity'],
    blockingPriority: 'low'
  },
  SHIPPER: {
    id: 'SHIPPER',
    name: 'Delivery Shipper',
    bias: 'Ship fast, iterate quickly',
    safeguard: 'Monitor for issues after shipping',
    concerns: ['delivery', 'speed', 'monitoring'],
    blockingPriority: 'low'
  }
};

/**
 * Risk tier to deliberation mode mapping
 */
const TIER_DELIBERATION_MODE = {
  'T0': 'skip',        // Observation only - no council needed
  'T1': 'skip',        // Internal ops - no council needed
  'T2': 'quick',       // External effects - quick council
  'T3': 'full',        // Financial/customer - full council
  'T4': 'full_block'   // Irreversible - full council with blocking
};

/**
 * Council Deliberation Manager
 */
export class CouncilDeliberation {
  constructor(config = {}) {
    this.config = config;
    this.personas = { ...COUNCIL_PERSONAS };
    this.enabled = config.enabled !== false;
    this.auditLog = [];
  }

  /**
   * Main deliberation entry point
   *
   * @param {object} intent - Classified intent from judgement layer
   * @param {object} context - Execution context
   * @returns {Promise<DeliberationResult>}
   */
  async deliberate(intent, context = {}) {
    const riskTier = intent.risk_tier || 'T0';
    const mode = TIER_DELIBERATION_MODE[riskTier] || 'skip';

    // Fast-path for low-risk operations
    if (mode === 'skip' || !this.enabled) {
      return {
        mode: 'skipped',
        consensus: 'approved',
        reason: `${riskTier} operations do not require council deliberation`,
        blockers: [],
        warnings: [],
        personaVotes: {}
      };
    }

    console.log(`[COUNCIL] Deliberating ${riskTier} operation: ${intent.intent}`);

    // Gather votes from all personas
    const votes = await this._gatherVotes(intent, context, mode);

    // Determine consensus
    const consensus = this._determineConsensus(votes, mode);

    // Build result
    const result = {
      mode,
      consensus: consensus.decision,
      reason: consensus.reason,
      blockers: consensus.blockers,
      warnings: consensus.warnings,
      personaVotes: votes,
      deliberation_id: `COUNCIL_${Date.now()}`,
      timestamp: new Date().toISOString()
    };

    // Log to audit
    this._logDeliberation(result, intent);

    return result;
  }

  /**
   * Gather votes from all personas
   */
  async _gatherVotes(intent, context, mode) {
    const votes = {};

    for (const [id, persona] of Object.entries(this.personas)) {
      votes[id] = this._evaluatePersona(persona, intent, context, mode);
    }

    return votes;
  }

  /**
   * Evaluate operation from a specific persona's perspective
   */
  _evaluatePersona(persona, intent, context, mode) {
    const concerns = this._identifyConcerns(persona, intent, context);
    const vote = this._calculateVote(concerns, persona, mode);

    return {
      persona: persona.id,
      vote: vote.decision,
      confidence: vote.confidence,
      concerns,
      reason: vote.reason,
      blocking: vote.blocking
    };
  }

  /**
   * Identify concerns from persona's perspective
   */
  _identifyConcerns(persona, intent, context) {
    const concerns = [];
    const tools = intent.tools || intent.tool_sequence || [];
    const riskTier = intent.risk_tier || 'T0';

    // ARCHITECT concerns
    if (persona.id === 'ARCHITECT') {
      if (tools.some(t => t.includes('delete') || t.includes('remove'))) {
        concerns.push({
          type: 'schema_consistency',
          severity: 'high',
          message: 'Deletion operations may affect data integrity'
        });
      }
      if (tools.length > 5) {
        concerns.push({
          type: 'system_design',
          severity: 'medium',
          message: 'Complex multi-tool operation - verify design consistency'
        });
      }
    }

    // CRITIC concerns
    if (persona.id === 'CRITIC') {
      if (tools.some(t => t.includes('delete'))) {
        concerns.push({
          type: 'data_loss',
          severity: 'critical',
          message: 'Deletion operation - ensure backup exists'
        });
      }
      if (riskTier === 'T4') {
        concerns.push({
          type: 'irreversibility',
          severity: 'critical',
          message: 'T4 operation is irreversible - require explicit confirmation'
        });
      }
      if (tools.some(t => t.includes('email') || t.includes('sms'))) {
        concerns.push({
          type: 'external_comm',
          severity: 'high',
          message: 'External communication - verify recipient and content'
        });
      }
    }

    // PLANNER concerns
    if (persona.id === 'PLANNER') {
      if (tools.length > 1) {
        concerns.push({
          type: 'ordering',
          severity: 'medium',
          message: 'Multi-step operation - verify correct sequence'
        });
      }
      if (intent.intent === 'quote' && !context.lead_id && !context.inspection_id) {
        concerns.push({
          type: 'dependencies',
          severity: 'high',
          message: 'Quote requires lead or inspection context'
        });
      }
    }

    // ENGINEER concerns
    if (persona.id === 'ENGINEER') {
      if (tools.some(t => !t.includes('.'))) {
        concerns.push({
          type: 'contracts',
          severity: 'high',
          message: 'Tool name does not follow domain.method convention'
        });
      }
    }

    // INSPECTOR concerns
    if (persona.id === 'INSPECTOR') {
      if (riskTier >= 'T2' && !context.evidence && !context.lead_id) {
        concerns.push({
          type: 'evidence',
          severity: 'medium',
          message: 'No evidence or context provided for T2+ operation'
        });
      }
      if (intent.intent === 'execute' && !intent.reasoning) {
        concerns.push({
          type: 'verification',
          severity: 'medium',
          message: 'Execution without documented reasoning'
        });
      }
    }

    // REFINER concerns
    if (persona.id === 'REFINER') {
      if (tools.some(t => t.includes('sms') || t.includes('email'))) {
        concerns.push({
          type: 'communication',
          severity: 'medium',
          message: 'Customer communication - ensure professional tone'
        });
      }
    }

    // SHIPPER concerns
    if (persona.id === 'SHIPPER') {
      if (tools.length > 10) {
        concerns.push({
          type: 'speed',
          severity: 'low',
          message: 'Large operation - consider batching for faster feedback'
        });
      }
    }

    return concerns;
  }

  /**
   * Calculate vote based on concerns
   */
  _calculateVote(concerns, persona, mode) {
    const criticalConcerns = concerns.filter(c => c.severity === 'critical');
    const highConcerns = concerns.filter(c => c.severity === 'high');
    const mediumConcerns = concerns.filter(c => c.severity === 'medium');

    // Critical concerns = block
    if (criticalConcerns.length > 0 && persona.blockingPriority === 'critical') {
      return {
        decision: 'block',
        blocking: true,
        confidence: 0.95,
        reason: criticalConcerns[0].message
      };
    }

    // High concerns from high-priority personas = block in full mode
    if (highConcerns.length > 0 && persona.blockingPriority === 'high' && mode === 'full_block') {
      return {
        decision: 'block',
        blocking: true,
        confidence: 0.85,
        reason: highConcerns[0].message
      };
    }

    // High concerns = warn
    if (highConcerns.length > 0) {
      return {
        decision: 'warn',
        blocking: false,
        confidence: 0.75,
        reason: highConcerns[0].message
      };
    }

    // Medium concerns = approve with caution
    if (mediumConcerns.length > 0) {
      return {
        decision: 'approve_with_caution',
        blocking: false,
        confidence: 0.7,
        reason: mediumConcerns[0].message
      };
    }

    // No concerns = approve
    return {
      decision: 'approve',
      blocking: false,
      confidence: 0.9,
      reason: 'No concerns identified'
    };
  }

  /**
   * Determine consensus from all votes
   */
  _determineConsensus(votes, mode) {
    const blockers = [];
    const warnings = [];
    let approveCount = 0;
    let warnCount = 0;
    let blockCount = 0;

    for (const [personaId, vote] of Object.entries(votes)) {
      if (vote.vote === 'block') {
        blockCount++;
        blockers.push({
          persona: personaId,
          reason: vote.reason
        });
      } else if (vote.vote === 'warn' || vote.vote === 'approve_with_caution') {
        warnCount++;
        warnings.push({
          persona: personaId,
          reason: vote.reason
        });
      } else {
        approveCount++;
      }
    }

    // Any blocker in full_block mode = rejected
    if (mode === 'full_block' && blockers.length > 0) {
      return {
        decision: 'rejected',
        reason: `Blocked by ${blockers.map(b => b.persona).join(', ')}: ${blockers[0].reason}`,
        blockers,
        warnings
      };
    }

    // Critical blockers in any mode = rejected
    const criticalBlockers = blockers.filter(b =>
      this.personas[b.persona]?.blockingPriority === 'critical'
    );
    if (criticalBlockers.length > 0) {
      return {
        decision: 'rejected',
        reason: `Critical block by ${criticalBlockers[0].persona}: ${criticalBlockers[0].reason}`,
        blockers,
        warnings
      };
    }

    // Majority warnings = approved_with_warnings
    if (warnCount >= 3) {
      return {
        decision: 'approved_with_warnings',
        reason: `Approved with ${warnCount} warnings from council`,
        blockers,
        warnings
      };
    }

    // Some warnings = approved_with_caution
    if (warnings.length > 0) {
      return {
        decision: 'approved_with_caution',
        reason: `Approved with caution: ${warnings[0].reason}`,
        blockers,
        warnings
      };
    }

    // All approve = approved
    return {
      decision: 'approved',
      reason: 'Council unanimously approved',
      blockers,
      warnings
    };
  }

  /**
   * Log deliberation to audit trail
   */
  _logDeliberation(result, intent) {
    const entry = {
      id: result.deliberation_id,
      timestamp: result.timestamp,
      intent: intent.intent,
      risk_tier: intent.risk_tier,
      mode: result.mode,
      consensus: result.consensus,
      blockers: result.blockers.length,
      warnings: result.warnings.length
    };

    this.auditLog.push(entry);

    // Keep last 100 entries
    if (this.auditLog.length > 100) {
      this.auditLog = this.auditLog.slice(-100);
    }

    console.log(`[COUNCIL] Deliberation ${result.deliberation_id}: ${result.consensus}`);
    if (result.blockers.length > 0) {
      console.log(`  Blockers: ${result.blockers.map(b => b.persona).join(', ')}`);
    }
    if (result.warnings.length > 0) {
      console.log(`  Warnings: ${result.warnings.map(w => w.persona).join(', ')}`);
    }
  }

  /**
   * Get audit log
   */
  getAuditLog(limit = 20) {
    return this.auditLog.slice(-limit);
  }

  /**
   * Format deliberation result for display
   */
  formatResult(result) {
    const lines = [];

    lines.push(`COUNCIL DELIBERATION: ${result.consensus.toUpperCase()}`);
    lines.push(`Mode: ${result.mode}`);
    lines.push(`Reason: ${result.reason}`);

    if (result.blockers.length > 0) {
      lines.push('\nBLOCKERS:');
      result.blockers.forEach(b => {
        lines.push(`  [${b.persona}] ${b.reason}`);
      });
    }

    if (result.warnings.length > 0) {
      lines.push('\nWARNINGS:');
      result.warnings.forEach(w => {
        lines.push(`  [${w.persona}] ${w.reason}`);
      });
    }

    return lines.join('\n');
  }
}

/**
 * Shared council instance
 */
let sharedCouncil = null;

export function getSharedCouncil(config = {}) {
  if (!sharedCouncil) {
    sharedCouncil = new CouncilDeliberation(config);
  }
  return sharedCouncil;
}

export function resetSharedCouncil() {
  sharedCouncil = null;
}
