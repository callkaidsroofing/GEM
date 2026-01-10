#!/usr/bin/env node
/**
 * CKR-GEM Operator Examples
 *
 * Demonstrates the 4-layer execution model with various scenarios.
 */

import { createOperator } from '../src/operator/orchestrator.js';

async function runExamples() {
  console.log('CKR-GEM OPERATOR EXAMPLES');
  console.log('='.repeat(80) + '\n');

  const operator = createOperator({
    openrouter_api_key: process.env.OPENROUTER_API_KEY,
    openrouter_model: process.env.OPENROUTER_MODEL
  });

  // Example 1: T0 - Read-only operation (no approval)
  console.log('EXAMPLE 1: T0 Read Operation (System Status)');
  console.log('-'.repeat(80));
  try {
    const result1 = await operator.process({
      message: 'system status',
      mode: 'analyze'
    });
    displaySummary(result1);
  } catch (error) {
    console.error('Example 1 failed:', error.message);
  }

  // Example 2: T1 - Task creation (local artifact)
  console.log('\nEXAMPLE 2: T1 Local Artifact (Create Task)');
  console.log('-'.repeat(80));
  try {
    const result2 = await operator.process({
      message: 'create task: follow up with John about roof inspection',
      mode: 'plan'
    });
    displaySummary(result2);
  } catch (error) {
    console.error('Example 2 failed:', error.message);
  }

  // Example 3: T1 - Lead creation
  console.log('\nEXAMPLE 3: T1 Lead Creation');
  console.log('-'.repeat(80));
  try {
    const result3 = await operator.process({
      message: 'new lead: Sarah Mitchell 0412345678 in Clayton, wants quote for tile replacement',
      mode: 'plan'
    });
    displaySummary(result3);
  } catch (error) {
    console.error('Example 3 failed:', error.message);
  }

  // Example 4: T2 - Quote finalization (requires approval)
  console.log('\nEXAMPLE 4: T2 Operation - Quote Finalization (Approval Required)');
  console.log('-'.repeat(80));
  try {
    const result4 = await operator.process({
      message: 'finalize quote 123e4567-e89b-12d3-a456-426614174000',
      mode: 'plan'
    });
    displaySummary(result4);
  } catch (error) {
    console.error('Example 4 failed:', error.message);
  }

  // Example 5: Inspection workflow (multi-tool sequence)
  console.log('\nEXAMPLE 5: Multi-Tool Sequence - Inspection Workflow');
  console.log('-'.repeat(80));
  try {
    const result5 = await operator.process({
      message: 'create inspection for lead 123e4567-e89b-12d3-a456-426614174000',
      mode: 'plan',
      context: {
        lead_id: '123e4567-e89b-12d3-a456-426614174000'
      }
    });
    displaySummary(result5);
  } catch (error) {
    console.error('Example 5 failed:', error.message);
  }

  // Example 6: Ambiguous request (should ask for clarification)
  console.log('\nEXAMPLE 6: Ambiguous Request (Clarification)');
  console.log('-'.repeat(80));
  try {
    const result6 = await operator.process({
      message: 'add something to the quote',
      mode: 'analyze'
    });
    displaySummary(result6);
  } catch (error) {
    console.error('Example 6 failed:', error.message);
  }

  // Example 7: Missing evidence
  console.log('\nEXAMPLE 7: Missing Evidence');
  console.log('-'.repeat(80));
  try {
    const result7 = await operator.process({
      message: 'create a lead for someone in Melbourne',
      mode: 'analyze'
    });
    displaySummary(result7);
  } catch (error) {
    console.error('Example 7 failed:', error.message);
  }

  // Example 8: Batch processing
  console.log('\nEXAMPLE 8: Batch Processing');
  console.log('-'.repeat(80));
  try {
    const batchResult = await operator.batch({
      messages: [
        'system status',
        'create task: review quotes',
        'create note: remember to order materials',
        'list my tasks'
      ],
      mode: 'analyze'
    });
    console.log(`Batch Summary:`);
    console.log(`  Total: ${batchResult.summary.total}`);
    console.log(`  Successful: ${batchResult.summary.successful}`);
    console.log(`  Failed: ${batchResult.summary.failed}`);
    console.log(`  Needs Approval: ${batchResult.summary.needs_approval}`);
    console.log(`  Needs Clarification: ${batchResult.summary.needs_clarification}\n`);
  } catch (error) {
    console.error('Example 8 failed:', error.message);
  }

  console.log('\n' + '='.repeat(80));
  console.log('EXAMPLES COMPLETE');
  console.log('='.repeat(80) + '\n');
}

function displaySummary(result) {
  console.log('Intent:', result.intent_summary?.split('\n')[0] || 'N/A');
  console.log('Plan:', result.plan_summary?.split('\n')[0] || result.result_summary?.split('\n')[0] || 'N/A');
  console.log('Tools:', result.tool_impact || 'None');
  console.log('Risk:', result.risks_and_gates?.split('\n')[0] || 'N/A');
  console.log('Next:', result.next_actions?.[0] || 'None');
  console.log();
}

// Run examples if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(error => {
    console.error('Examples failed:', error);
    process.exit(1);
  });
}

export { runExamples };
