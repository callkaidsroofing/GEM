import { supabase } from './src/lib/supabase.js';

async function checkDatabase() {
  console.log('Checking database state...\n');
  
  // Check core_tool_calls table
  const { data: calls, error: callsError } = await supabase
    .from('core_tool_calls')
    .select('id, tool_name, status')
    .limit(5);
  
  if (callsError) {
    console.log('core_tool_calls: ERROR -', callsError.message);
  } else {
    console.log('core_tool_calls: EXISTS -', calls?.length || 0, 'rows (sample)');
  }
  
  // Check core_tool_receipts table
  const { data: receipts, error: receiptsError } = await supabase
    .from('core_tool_receipts')
    .select('id, tool_name, status')
    .limit(5);
  
  if (receiptsError) {
    console.log('core_tool_receipts: ERROR -', receiptsError.message);
  } else {
    console.log('core_tool_receipts: EXISTS -', receipts?.length || 0, 'rows (sample)');
  }
  
  // Check leads table
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('id')
    .limit(1);
  
  if (leadsError) {
    console.log('leads: ERROR -', leadsError.message);
  } else {
    console.log('leads: EXISTS');
  }
  
  // Check inspections table
  const { data: inspections, error: inspError } = await supabase
    .from('inspections')
    .select('id')
    .limit(1);
  
  if (inspError) {
    console.log('inspections: ERROR -', inspError.message);
  } else {
    console.log('inspections: EXISTS');
  }
  
  // Check quotes table
  const { data: quotes, error: quotesError } = await supabase
    .from('quotes')
    .select('id')
    .limit(1);
  
  if (quotesError) {
    console.log('quotes: ERROR -', quotesError.message);
  } else {
    console.log('quotes: EXISTS');
  }
  
  // Check notes table
  const { data: notes, error: notesError } = await supabase
    .from('notes')
    .select('id')
    .limit(1);
  
  if (notesError) {
    console.log('notes: ERROR -', notesError.message);
  } else {
    console.log('notes: EXISTS');
  }
  
  // Check tasks table
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id')
    .limit(1);
  
  if (tasksError) {
    console.log('tasks: ERROR -', tasksError.message);
  } else {
    console.log('tasks: EXISTS');
  }
  
  // Check jobs table
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id')
    .limit(1);
  
  if (jobsError) {
    console.log('jobs: ERROR -', jobsError.message);
  } else {
    console.log('jobs: EXISTS');
  }
  
  // Check quote_line_items table
  const { data: qli, error: qliError } = await supabase
    .from('quote_line_items')
    .select('id')
    .limit(1);
  
  if (qliError) {
    console.log('quote_line_items: ERROR -', qliError.message);
  } else {
    console.log('quote_line_items: EXISTS');
  }
  
  // Test RPC function
  console.log('\nTesting RPC function...');
  const { data: rpcResult, error: rpcError } = await supabase
    .rpc('claim_next_core_tool_call', { p_worker_id: 'test-worker' });
  
  if (rpcError) {
    console.log('claim_next_core_tool_call RPC: ERROR -', rpcError.message);
  } else {
    console.log('claim_next_core_tool_call RPC: EXISTS - returned', rpcResult?.length || 0, 'rows');
  }
}

checkDatabase().catch(console.error);
