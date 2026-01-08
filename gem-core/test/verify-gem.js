/**
 * GEM System Verification Script
 * Tests all critical paths to ensure system integrity
 * 
 * Run with: node test/verify-gem.js
 */

import { supabase } from '../src/lib/supabase.js';
import { registry, getTool, getAllTools } from '../src/lib/registry.js';
import { validateInput } from '../src/lib/validate.js';

// Test results collector
const results = {
  passed: [],
  failed: [],
  skipped: []
};

function log(status, test, message = '') {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○';
  console.log(`  ${icon} ${test}${message ? ': ' + message : ''}`);
  
  if (status === 'PASS') results.passed.push(test);
  else if (status === 'FAIL') results.failed.push({ test, message });
  else results.skipped.push(test);
}

async function testDatabaseConnection() {
  console.log('\n📦 Database Connection Tests');
  
  try {
    const { data, error } = await supabase.from('core_tool_calls').select('id').limit(1);
    if (error) throw error;
    log('PASS', 'Supabase connection');
  } catch (e) {
    log('FAIL', 'Supabase connection', e.message);
  }
}

async function testRPCFunction() {
  console.log('\n🔧 RPC Function Tests');
  
  try {
    const { data, error } = await supabase.rpc('claim_next_core_tool_call', { 
      p_worker_id: 'test-verify-worker' 
    });
    if (error) throw error;
    log('PASS', 'claim_next_core_tool_call RPC exists');
  } catch (e) {
    log('FAIL', 'claim_next_core_tool_call RPC', e.message);
  }
}

async function testTableExistence() {
  console.log('\n📋 Table Existence Tests');
  
  const tables = [
    'core_tool_calls',
    'core_tool_receipts',
    'leads',
    'quotes',
    'quote_line_items',
    'notes',
    'tasks',
    'jobs'
  ];
  
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('id').limit(1);
      if (error && error.message.includes('does not exist')) {
        log('FAIL', `Table: ${table}`, 'does not exist');
      } else if (error) {
        log('FAIL', `Table: ${table}`, error.message);
      } else {
        log('PASS', `Table: ${table}`);
      }
    } catch (e) {
      log('FAIL', `Table: ${table}`, e.message);
    }
  }
  
  // Check inspections table specifically
  try {
    const { error } = await supabase.from('inspections').select('id').limit(1);
    if (error && error.message.includes('does not exist')) {
      log('FAIL', 'Table: inspections', 'NEEDS MIGRATION - run sql/006_create_inspections_table.sql');
    } else if (error) {
      log('FAIL', `Table: inspections`, error.message);
    } else {
      log('PASS', 'Table: inspections');
    }
  } catch (e) {
    log('FAIL', 'Table: inspections', e.message);
  }
}

async function testRegistryLoading() {
  console.log('\n📚 Registry Tests');
  
  try {
    const tools = getAllTools();
    log('PASS', 'Registry loads', `${tools.length} tools defined`);
    
    // Check critical tools exist
    const criticalTools = [
      'leads.create',
      'inspection.create',
      'quote.create_from_inspection',
      'comms.log_call_outcome',
      'os.health_check'
    ];
    
    for (const toolName of criticalTools) {
      const tool = getTool(toolName);
      if (tool) {
        log('PASS', `Tool defined: ${toolName}`);
      } else {
        log('FAIL', `Tool defined: ${toolName}`, 'not found in registry');
      }
    }
  } catch (e) {
    log('FAIL', 'Registry loading', e.message);
  }
}

async function testValidation() {
  console.log('\n✅ Validation Tests');
  
  try {
    // Test valid input
    const validResult = validateInput(
      { name: 'leads.create', input_schema: { type: 'object', required: ['name', 'phone'], properties: { name: { type: 'string' }, phone: { type: 'string' } } } },
      { name: 'Test Lead', phone: '0400000000' }
    );
    
    if (validResult.valid) {
      log('PASS', 'Valid input passes validation');
    } else {
      log('FAIL', 'Valid input passes validation', validResult.errors?.join(', '));
    }
    
    // Test invalid input
    const invalidResult = validateInput(
      { name: 'leads.create', input_schema: { type: 'object', required: ['name', 'phone'], properties: { name: { type: 'string' }, phone: { type: 'string' } } } },
      { name: 'Test Lead' } // Missing phone
    );
    
    if (!invalidResult.valid) {
      log('PASS', 'Invalid input fails validation');
    } else {
      log('FAIL', 'Invalid input fails validation', 'should have failed');
    }
  } catch (e) {
    log('FAIL', 'Validation', e.message);
  }
}

async function testHandlerImports() {
  console.log('\n🔌 Handler Import Tests');
  
  const handlers = [
    'leads',
    'inspection',
    'quote',
    'comms',
    'os',
    'job',
    'invoice',
    'calendar',
    'entity',
    'media',
    'marketing',
    'identity',
    'personal',
    'finance',
    'integrations'
  ];
  
  for (const handler of handlers) {
    try {
      const module = await import(`../src/handlers/${handler}.js`);
      const exportCount = Object.keys(module).length;
      log('PASS', `Handler: ${handler}`, `${exportCount} exports`);
    } catch (e) {
      log('FAIL', `Handler: ${handler}`, e.message);
    }
  }
}

async function testLeadsHandler() {
  console.log('\n👤 Leads Handler Tests');
  
  try {
    const { create, upsert, get, list_by_stage } = await import('../src/handlers/leads.js');
    
    // Test create function exists
    if (typeof create === 'function') {
      log('PASS', 'leads.create function exists');
    } else {
      log('FAIL', 'leads.create function exists');
    }
    
    // Test upsert function exists
    if (typeof upsert === 'function') {
      log('PASS', 'leads.upsert function exists');
    } else {
      log('FAIL', 'leads.upsert function exists');
    }
    
    // Test list function
    const listResult = await list_by_stage({ limit: 5 });
    if (listResult.result && Array.isArray(listResult.result.leads)) {
      log('PASS', 'leads.list_by_stage works', `${listResult.result.count} leads found`);
    } else {
      log('FAIL', 'leads.list_by_stage works');
    }
  } catch (e) {
    log('FAIL', 'Leads handler', e.message);
  }
}

async function testInspectionHandler() {
  console.log('\n🔍 Inspection Handler Tests');
  
  try {
    const { create, update, submit, get, list } = await import('../src/handlers/inspection.js');
    
    // Test functions exist
    const functions = { create, update, submit, get, list };
    for (const [name, fn] of Object.entries(functions)) {
      if (typeof fn === 'function') {
        log('PASS', `inspection.${name} function exists`);
      } else {
        log('FAIL', `inspection.${name} function exists`);
      }
    }
    
    // Test list function (if table exists)
    try {
      const listResult = await list({ limit: 5 });
      if (listResult.result && Array.isArray(listResult.result.inspections)) {
        log('PASS', 'inspection.list works', `${listResult.result.count} inspections found`);
      }
    } catch (e) {
      if (e.message.includes('does not exist')) {
        log('SKIP', 'inspection.list', 'inspections table needs migration');
      } else {
        log('FAIL', 'inspection.list', e.message);
      }
    }
  } catch (e) {
    log('FAIL', 'Inspection handler', e.message);
  }
}

async function testQuoteHandler() {
  console.log('\n💰 Quote Handler Tests');
  
  try {
    const { create_draft, create_from_inspection, add_item, calculate_totals, get } = await import('../src/handlers/quote.js');
    
    // Test functions exist
    const functions = { create_draft, create_from_inspection, add_item, calculate_totals, get };
    for (const [name, fn] of Object.entries(functions)) {
      if (typeof fn === 'function') {
        log('PASS', `quote.${name} function exists`);
      } else {
        log('FAIL', `quote.${name} function exists`);
      }
    }
  } catch (e) {
    log('FAIL', 'Quote handler', e.message);
  }
}

async function testCommsHandler() {
  console.log('\n📱 Comms Handler Tests');
  
  try {
    const { draft_sms, draft_email, send_sms, send_email, log_call_outcome } = await import('../src/handlers/comms.js');
    
    // Test safe stubs return not_configured
    const smsResult = await send_sms({ phone: '0400000000', message: 'test' });
    if (smsResult.result?.status === 'not_configured') {
      log('PASS', 'comms.send_sms returns not_configured (safe)');
    } else {
      log('FAIL', 'comms.send_sms should return not_configured');
    }
    
    const emailResult = await send_email({ email: 'test@test.com', subject: 'test', body: 'test' });
    if (emailResult.result?.status === 'not_configured') {
      log('PASS', 'comms.send_email returns not_configured (safe)');
    } else {
      log('FAIL', 'comms.send_email should return not_configured');
    }
    
    // Test draft functions exist
    if (typeof draft_sms === 'function') {
      log('PASS', 'comms.draft_sms function exists (safe alternative)');
    }
    if (typeof draft_email === 'function') {
      log('PASS', 'comms.draft_email function exists (safe alternative)');
    }
  } catch (e) {
    log('FAIL', 'Comms handler', e.message);
  }
}

async function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`  ✓ Passed:  ${results.passed.length}`);
  console.log(`  ✗ Failed:  ${results.failed.length}`);
  console.log(`  ○ Skipped: ${results.skipped.length}`);
  
  if (results.failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    for (const { test, message } of results.failed) {
      console.log(`  - ${test}: ${message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  
  if (results.failed.length === 0) {
    console.log('🎉 All tests passed! GEM system is ready.');
  } else {
    console.log('⚠️  Some tests failed. Review the issues above.');
  }
  
  console.log('='.repeat(60) + '\n');
}

// Run all tests
async function main() {
  console.log('🔬 GEM System Verification');
  console.log('='.repeat(60));
  
  await testDatabaseConnection();
  await testRPCFunction();
  await testTableExistence();
  await testRegistryLoading();
  await testValidation();
  await testHandlerImports();
  await testLeadsHandler();
  await testInspectionHandler();
  await testQuoteHandler();
  await testCommsHandler();
  
  await printSummary();
  
  process.exit(results.failed.length > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
