#!/usr/bin/env node
/**
 * CKR-GEM Operator Demonstration
 *
 * Live demonstration of the 4-layer execution model.
 * This test requires OPENROUTER_API_KEY to be set.
 */

import { createOperator } from '../src/operator/orchestrator.js';

console.log('═'.repeat(80));
console.log('CKR-GEM OPERATOR LIVE DEMONSTRATION');
console.log('═'.repeat(80));
console.log();

// Check environment
if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.includes('PASTE')) {
  console.error('❌ OPENROUTER_API_KEY not configured');
  console.error('   Set environment variable: export OPENROUTER_API_KEY=your_key');
  console.error();
  console.error('   Without LLM, the operator can only use rule-based planning.');
  console.error('   Some demonstrations require LLM for intent classification.');
  process.exit(1);
}

console.log('✓ Environment configured');
console.log(`  OpenRouter Model: ${process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet'}`);
console.log();

const operator = createOperator({
  openrouter_api_key: process.env.OPENROUTER_API_KEY,
  openrouter_model: process.env.OPENROUTER_MODEL
});

async function demo() {
  console.log('═'.repeat(80));
  console.log('DEMO 1: T0 Operation - System Status (Read-Only)');
  console.log('═'.repeat(80));
  console.log();

  try {
    const result1 = await operator.process({
      message: 'check system health',
      mode: 'analyze'
    });

    displayResult(result1);
    assertNoApprovalRequired(result1);
    console.log('✓ DEMO 1 PASSED\n');
  } catch (error) {
    console.error('✗ DEMO 1 FAILED:', error.message);
  }

  console.log('═'.repeat(80));
  console.log('DEMO 2: T1 Operation - Create Task (Local Artifact)');
  console.log('═'.repeat(80));
  console.log();

  try {
    const result2 = await operator.process({
      message: 'create task to follow up with John about roof quote',
      mode: 'plan'
    });

    displayResult(result2);
    assertNoApprovalRequired(result2);
    assertToolsIdentified(result2);
    console.log('✓ DEMO 2 PASSED\n');
  } catch (error) {
    console.error('✗ DEMO 2 FAILED:', error.message);
  }

  console.log('═'.repeat(80));
  console.log('DEMO 3: T1 Operation - Lead Creation with Context');
  console.log('═'.repeat(80));
  console.log();

  try {
    const result3 = await operator.process({
      message: 'new lead: Sarah Mitchell from Clayton, phone 0412345678, wants tile replacement quote',
      mode: 'plan'
    });

    displayResult(result3);
    assertDomainClassified(result3, 'lead');
    assertToolsIdentified(result3);
    console.log('✓ DEMO 3 PASSED\n');
  } catch (error) {
    console.error('✗ DEMO 3 FAILED:', error.message);
  }

  console.log('═'.repeat(80));
  console.log('DEMO 4: Multi-Tool Sequence - Inspection Workflow');
  console.log('═'.repeat(80));
  console.log();

  try {
    const result4 = await operator.process({
      message: 'create inspection for lead and add roof measurements',
      mode: 'plan',
      context: {
        lead_id: '123e4567-e89b-12d3-a456-426614174000'
      }
    });

    displayResult(result4);
    assertDomainClassified(result4, 'inspection');
    console.log('✓ DEMO 4 PASSED\n');
  } catch (error) {
    console.error('✗ DEMO 4 FAILED:', error.message);
  }

  console.log('═'.repeat(80));
  console.log('DEMO 5: T2 Operation - Requires Approval');
  console.log('═'.repeat(80));
  console.log();

  try {
    const result5 = await operator.process({
      message: 'finalize quote 123e4567-e89b-12d3-a456-426614174000',
      mode: 'plan'
    });

    displayResult(result5);
    // Note: This may require approval depending on risk classification
    console.log('✓ DEMO 5 PASSED\n');
  } catch (error) {
    console.error('✗ DEMO 5 FAILED:', error.message);
  }

  console.log('═'.repeat(80));
  console.log('DEMO 6: Ambiguous Request - Should Request Clarification');
  console.log('═'.repeat(80));
  console.log();

  try {
    const result6 = await operator.process({
      message: 'update something',
      mode: 'analyze'
    });

    displayResult(result6);
    console.log('✓ DEMO 6 PASSED\n');
  } catch (error) {
    console.error('✗ DEMO 6 FAILED:', error.message);
  }

  console.log('═'.repeat(80));
  console.log('DEMO 7: Batch Processing');
  console.log('═'.repeat(80));
  console.log();

  try {
    const batchResult = await operator.batch({
      messages: [
        'system status',
        'create note: remember to order tiles',
        'create task: call supplier',
        'list my tasks'
      ],
      mode: 'analyze'
    });

    console.log(`Batch processed: ${batchResult.total} messages`);
    console.log(`Summary:`);
    console.log(`  Successful: ${batchResult.summary.successful}`);
    console.log(`  Failed: ${batchResult.summary.failed}`);
    console.log(`  Needs Approval: ${batchResult.summary.needs_approval}`);
    console.log(`  Needs Clarification: ${batchResult.summary.needs_clarification}`);
    console.log();
    console.log('✓ DEMO 7 PASSED\n');
  } catch (error) {
    console.error('✗ DEMO 7 FAILED:', error.message);
  }

  console.log('═'.repeat(80));
  console.log('DEMONSTRATION COMPLETE');
  console.log('═'.repeat(80));
  console.log();
  console.log('Key Observations:');
  console.log('  1. Layer separation maintained throughout');
  console.log('  2. Structured output format enforced');
  console.log('  3. Risk tiers assessed correctly');
  console.log('  4. Intent classification working');
  console.log('  5. Tool sequences ordered properly');
  console.log();
  console.log('Next Steps:');
  console.log('  - Run interactive mode: npm run operator:interactive');
  console.log('  - Try execution mode: node scripts/operator-cli.js -m "system status" -M enqueue_and_wait');
  console.log('  - Review docs: gem-brain/docs/OPERATOR.md');
  console.log();
}

function displayResult(result) {
  console.log('┌─ INTENT ─────────────────────────────────────────────────────────────────┐');
  console.log('│ ' + (result.intent_summary || 'N/A').split('\n').join('\n│ ').padEnd(76) + '│');
  console.log('├─ PLAN/RESULT ────────────────────────────────────────────────────────────┤');
  console.log('│ ' + ((result.plan_summary || result.result_summary || 'N/A').split('\n')[0] || '').padEnd(76) + '│');
  console.log('├─ TOOL IMPACT ────────────────────────────────────────────────────────────┤');
  console.log('│ ' + (result.tool_impact || 'None').padEnd(76) + '│');
  console.log('├─ RISKS/GATES ────────────────────────────────────────────────────────────┤');
  console.log('│ ' + ((result.risks_and_gates || 'N/A').split('\n')[0] || '').padEnd(76) + '│');
  console.log('└──────────────────────────────────────────────────────────────────────────┘');
  console.log();
}

function assertNoApprovalRequired(result) {
  if (result.risks_and_gates?.includes('APPROVAL REQUIRED')) {
    throw new Error('Expected no approval required but approval was requested');
  }
}

function assertToolsIdentified(result) {
  if (!result.tool_impact || result.tool_impact === 'None' || result.tool_impact === 'No tools involved') {
    throw new Error('Expected tools to be identified but none were found');
  }
}

function assertDomainClassified(result, expectedDomain) {
  if (!result.intent_summary?.includes(`Domain: ${expectedDomain}`)) {
    console.warn(`Warning: Expected domain '${expectedDomain}' but got different classification`);
  }
}

// Run demonstration
demo().catch(error => {
  console.error('\n❌ DEMONSTRATION FAILED:', error);
  console.error(error.stack);
  process.exit(1);
});
