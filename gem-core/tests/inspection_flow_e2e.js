#!/usr/bin/env node
/**
 * Inspection Flow E2E Test
 *
 * Tests the complete inspection → quote pipeline:
 * 1. Create lead
 * 2. Create inspection
 * 3. Register and link photos
 * 4. Add measurements and defects
 * 5. Submit inspection
 * 6. Create quote from inspection
 * 7. Add line items
 * 8. Calculate totals
 * 9. Finalize quote
 *
 * Run: node tests/inspection_flow_e2e.js
 */

import { supabase } from '../src/lib/supabase.js';

// Import handlers directly for testing
import * as leads from '../src/handlers/leads.js';
import * as inspection from '../src/handlers/inspection.js';
import * as media from '../src/handlers/media.js';
import * as quote from '../src/handlers/quote.js';

const TEST_PREFIX = 'E2E_TEST_';

async function runE2ETest() {
  console.log('\n🔧 INSPECTION FLOW E2E TEST\n');
  console.log('=' .repeat(50));

  const testId = Date.now().toString(36);
  const results = { passed: 0, failed: 0, steps: [] };

  function log(step, status, details = '') {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏳';
    console.log(`${icon} ${step}${details ? ': ' + details : ''}`);
    results.steps.push({ step, status, details });
    if (status === 'PASS') results.passed++;
    if (status === 'FAIL') results.failed++;
  }

  try {
    // ========================================
    // STEP 1: Create Lead
    // ========================================
    log('Step 1: Create Lead', 'RUN');

    const leadResult = await leads.create({
      name: `${TEST_PREFIX}John Smith ${testId}`,
      phone: `+61400${testId.slice(0, 6).padEnd(6, '0')}`,
      suburb: 'Brisbane',
      service: 'roof_inspection',
      source: 'e2e_test'
    });

    if (leadResult.result?.lead_id) {
      log('Step 1: Create Lead', 'PASS', `lead_id: ${leadResult.result.lead_id}`);
    } else {
      throw new Error('No lead_id returned');
    }

    const leadId = leadResult.result.lead_id;

    // ========================================
    // STEP 2: Create Inspection
    // ========================================
    log('Step 2: Create Inspection', 'RUN');

    const inspResult = await inspection.create({
      lead_id: leadId,
      site_address: '123 Test Street',
      site_suburb: 'Brisbane',
      notes: 'E2E test inspection'
    });

    if (inspResult.result?.inspection_id) {
      log('Step 2: Create Inspection', 'PASS', `inspection_id: ${inspResult.result.inspection_id}`);
    } else {
      throw new Error('No inspection_id returned');
    }

    const inspectionId = inspResult.result.inspection_id;

    // ========================================
    // STEP 3: Register Media Asset
    // ========================================
    log('Step 3: Register Media Asset', 'RUN');

    const fileRef = `${TEST_PREFIX}photo_${testId}.jpg`;
    const mediaResult = await media.register_asset({
      file_ref: fileRef,
      asset_type: 'photo',
      inspection_id: inspectionId,
      suburb: 'Brisbane',
      tags: ['roof', 'exterior', 'before'],
      metadata: { source: 'e2e_test' }
    });

    if (mediaResult.result?.asset_id) {
      log('Step 3: Register Media Asset', 'PASS', `asset_id: ${mediaResult.result.asset_id}`);
    } else {
      throw new Error('No asset_id returned');
    }

    const assetId = mediaResult.result.asset_id;

    // ========================================
    // STEP 4: Add Photo to Inspection
    // ========================================
    log('Step 4: Add Photo to Inspection', 'RUN');

    const photoResult = await inspection.add_photo_ref({
      inspection_id: inspectionId,
      photo_url: `https://storage.example.com/${fileRef}`,
      caption: 'Front of roof - before work',
      tags: ['before', 'exterior']
    });

    if (photoResult.result?.photo_added) {
      log('Step 4: Add Photo to Inspection', 'PASS', `photos_count: ${photoResult.result.photos_count}`);
    } else {
      throw new Error('Photo not added');
    }

    // ========================================
    // STEP 5: Add Measurements
    // ========================================
    log('Step 5: Add Measurements', 'RUN');

    const measurements = [
      { measurement_type: 'roof_area', value: 150, unit: 'sqm', location: 'main roof' },
      { measurement_type: 'ridge_length', value: 12, unit: 'm', location: 'main ridge' },
      { measurement_type: 'gutter_length', value: 45, unit: 'm', location: 'perimeter' }
    ];

    for (const m of measurements) {
      await inspection.add_measurement({ inspection_id: inspectionId, ...m });
    }

    log('Step 5: Add Measurements', 'PASS', `${measurements.length} measurements added`);

    // ========================================
    // STEP 6: Add Defects
    // ========================================
    log('Step 6: Add Defects', 'RUN');

    const defects = [
      { defect_type: 'tile', severity: 'high', description: '3 cracked tiles near chimney' },
      { defect_type: 'ridge', severity: 'medium', description: 'Ridge capping needs repointing' },
      { defect_type: 'gutter', severity: 'low', description: 'Minor debris buildup' }
    ];

    for (const d of defects) {
      await inspection.add_defect({ inspection_id: inspectionId, ...d });
    }

    log('Step 6: Add Defects', 'PASS', `${defects.length} defects recorded`);

    // ========================================
    // STEP 7: Submit Inspection
    // ========================================
    log('Step 7: Submit Inspection', 'RUN');

    const submitResult = await inspection.submit({
      inspection_id: inspectionId
    });

    if (submitResult.result?.submitted) {
      log('Step 7: Submit Inspection', 'PASS', 'inspection submitted/locked');
    } else {
      throw new Error('Inspection not submitted');
    }

    // ========================================
    // STEP 8: Create Quote from Inspection
    // ========================================
    log('Step 8: Create Quote from Inspection', 'RUN');

    const quoteResult = await quote.create_from_inspection({
      inspection_id: inspectionId,
      pricing_profile: 'standard',
      notes: 'Quote generated from E2E test inspection'
    });

    if (quoteResult.result?.quote_id) {
      log('Step 8: Create Quote from Inspection', 'PASS', `quote_id: ${quoteResult.result.quote_id}`);
    } else {
      throw new Error('No quote_id returned');
    }

    const quoteId = quoteResult.result.quote_id;

    // ========================================
    // STEP 9: Add Line Items
    // ========================================
    log('Step 9: Add Line Items', 'RUN');

    const lineItems = [
      { description: 'Replace cracked tiles (3)', quantity: 3, unit_price_cents: 8500, item_type: 'labour' },
      { description: 'Concrete roof tiles', quantity: 3, unit_price_cents: 4500, item_type: 'materials' },
      { description: 'Repoint ridge capping', quantity: 12, unit_price_cents: 2500, item_type: 'labour' },
      { description: 'Ridge pointing compound', quantity: 1, unit_price_cents: 12000, item_type: 'materials' },
      { description: 'Gutter clean', quantity: 45, unit_price_cents: 300, item_type: 'labour' }
    ];

    for (const item of lineItems) {
      await quote.add_item({ quote_id: quoteId, ...item });
    }

    log('Step 9: Add Line Items', 'PASS', `${lineItems.length} items added`);

    // ========================================
    // STEP 10: Calculate Totals
    // ========================================
    log('Step 10: Calculate Totals', 'RUN');

    const totalsResult = await quote.calculate_totals({ quote_id: quoteId });

    if (totalsResult.result?.totals) {
      const t = totalsResult.result.totals;
      log('Step 10: Calculate Totals', 'PASS',
        `subtotal: $${(t.subtotal_cents / 100).toFixed(2)}, ` +
        `GST: $${(t.tax_cents / 100).toFixed(2)}, ` +
        `total: $${(t.total_cents / 100).toFixed(2)}`
      );
    } else {
      throw new Error('Totals not calculated');
    }

    // ========================================
    // STEP 11: Finalize Quote
    // ========================================
    log('Step 11: Finalize Quote', 'RUN');

    const finalizeResult = await quote.finalize({ quote_id: quoteId });

    if (finalizeResult.result?.status === 'finalized') {
      log('Step 11: Finalize Quote', 'PASS', 'quote finalized');
    } else {
      throw new Error('Quote not finalized');
    }

    // ========================================
    // STEP 12: Verify Final State
    // ========================================
    log('Step 12: Verify Final State', 'RUN');

    const finalQuote = await quote.get({ quote_id: quoteId });
    const finalInsp = await inspection.get({ inspection_id: inspectionId });

    const verifications = [
      { check: 'Quote status', expected: 'finalized', actual: finalQuote.result.quote.status },
      { check: 'Inspection status', expected: 'submitted', actual: finalInsp.result.inspection.status },
      { check: 'Quote has items', expected: true, actual: finalQuote.result.quote.line_items?.length > 0 },
      { check: 'Inspection has payload', expected: true, actual: !!finalInsp.result.inspection.payload }
    ];

    let allPass = true;
    for (const v of verifications) {
      if (v.actual !== v.expected) {
        console.log(`   ⚠️  ${v.check}: expected ${v.expected}, got ${v.actual}`);
        allPass = false;
      }
    }

    if (allPass) {
      log('Step 12: Verify Final State', 'PASS', 'all verifications passed');
    } else {
      log('Step 12: Verify Final State', 'FAIL', 'some verifications failed');
    }

    // ========================================
    // Summary
    // ========================================
    console.log('\n' + '=' .repeat(50));
    console.log('📊 TEST SUMMARY');
    console.log('=' .repeat(50));
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📝 Total:  ${results.steps.length}`);
    console.log('\n📦 Created Resources:');
    console.log(`   Lead:       ${leadId}`);
    console.log(`   Inspection: ${inspectionId}`);
    console.log(`   Asset:      ${assetId}`);
    console.log(`   Quote:      ${quoteId}`);

    if (results.failed === 0) {
      console.log('\n🎉 ALL TESTS PASSED!\n');
      return { success: true, ...results, leadId, inspectionId, assetId, quoteId };
    } else {
      console.log('\n💥 SOME TESTS FAILED\n');
      return { success: false, ...results };
    }

  } catch (error) {
    console.error('\n💥 TEST CRASHED:', error.message);
    console.error(error.stack);
    return { success: false, error: error.message, ...results };
  }
}

// Cleanup function (optional)
async function cleanup(leadId) {
  if (!leadId) return;

  console.log('\n🧹 Cleaning up test data...');

  // Delete in reverse dependency order
  // Note: With CASCADE, deleting the lead should clean up related records
  try {
    await supabase.from('leads').delete().eq('id', leadId);
    console.log('✅ Test data cleaned up');
  } catch (e) {
    console.log('⚠️  Cleanup failed:', e.message);
  }
}

// Run
const result = await runE2ETest();

// Optionally cleanup
if (process.argv.includes('--cleanup') && result.leadId) {
  await cleanup(result.leadId);
}

process.exit(result.success ? 0 : 1);
