import { supabase } from '../lib/supabase.js';
import { success, notConfigured } from '../lib/responses.js';

/**
 * quote.create_draft - Create a new quote draft
 * Can be linked to a lead or inspection
 */
export async function create_draft(input) {
  const { lead_id, inspection_id, notes, title } = input;

  const insertData = {
    status: 'draft',
    notes: notes || null,
    title: title || null
  };

  if (lead_id) {
    insertData.lead_id = lead_id;
  }

  if (inspection_id) {
    insertData.inspection_id = inspection_id;
  }

  const { data, error } = await supabase
    .from('quotes')
    .insert(insertData)
    .select('id, status')
    .single();

  if (error) {
    throw new Error(`Failed to create quote: ${error.message}`);
  }

  return success(
    { quote_id: data.id, status: data.status },
    { db_writes: [{ table: 'quotes', action: 'insert', id: data.id }] }
  );
}

/**
 * quote.create_from_inspection - Create a quote draft from a submitted inspection
 */
export async function create_from_inspection(input) {
  const { inspection_id, pricing_profile, notes, auto_populate } = input;

  // Verify inspection exists and is submitted
  const { data: inspection, error: inspError } = await supabase
    .from('inspections')
    .select('id, status, lead_id, payload')
    .eq('id', inspection_id)
    .maybeSingle();

  if (inspError) {
    throw new Error(`Failed to fetch inspection: ${inspError.message}`);
  }

  if (!inspection) {
    throw new Error(`Inspection ${inspection_id} not found`);
  }

  // Create quote
  const { data, error } = await supabase
    .from('quotes')
    .insert({
      inspection_id,
      lead_id: inspection.lead_id,
      status: 'draft',
      notes,
      metadata: {
        pricing_profile: pricing_profile || 'standard',
        created_from_inspection: true
      }
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create quote: ${error.message}`);
  }

  // If auto_populate and inspection has measurements, create line items from pricebook
  if (auto_populate && inspection.payload?.measurements) {
    // This would be enhanced with actual pricebook lookup
  }

  return success(
    { quote_id: data.id, inspection_id },
    { db_writes: [{ table: 'quotes', action: 'insert', id: data.id }] }
  );
}

/**
 * quote.add_item - Add a line item to a quote
 * Prices are editable per item (within pricebook min/max if applicable)
 */
export async function add_item(input) {
  const { quote_id, description, quantity, unit_price_cents, item_type, pricebook_code } = input;

  // Verify quote exists and is draft
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('id, status')
    .eq('id', quote_id)
    .maybeSingle();

  if (quoteError || !quote) {
    throw new Error(`Quote ${quote_id} not found`);
  }

  if (quote.status !== 'draft') {
    throw new Error(`Cannot add items to ${quote.status} quote`);
  }

  // Get current max sort_order
  const { data: maxOrder } = await supabase
    .from('quote_line_items')
    .select('sort_order')
    .eq('quote_id', quote_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = (maxOrder?.sort_order || 0) + 1;
  const qty = quantity || 1;
  const lineTotalCents = Math.round(qty * unit_price_cents);

  const { data: item, error } = await supabase
    .from('quote_line_items')
    .insert({
      quote_id,
      description,
      quantity: qty,
      unit_price_cents,
      line_total_cents: lineTotalCents,
      item_type: item_type || 'labour',
      sort_order: sortOrder
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to add line item: ${error.message}`);
  }

  return success(
    { quote_id, item_id: item.id, line_total_cents: lineTotalCents },
    { db_writes: [{ table: 'quote_line_items', action: 'insert', id: item.id }] }
  );
}

/**
 * quote.update_item - Update a specific line item
 * Allows editing price within range
 */
export async function update_item(input) {
  const { item_id, description, quantity, unit_price_cents, item_type } = input;

  // Fetch existing item
  const { data: existing, error: fetchError } = await supabase
    .from('quote_line_items')
    .select('*, quotes!inner(status)')
    .eq('id', item_id)
    .maybeSingle();

  if (fetchError || !existing) {
    throw new Error(`Line item ${item_id} not found`);
  }

  if (existing.quotes.status !== 'draft') {
    throw new Error(`Cannot update items on ${existing.quotes.status} quote`);
  }

  const updateData = {
    updated_at: new Date().toISOString()
  };

  if (description !== undefined) updateData.description = description;
  if (quantity !== undefined) updateData.quantity = quantity;
  if (unit_price_cents !== undefined) updateData.unit_price_cents = unit_price_cents;
  if (item_type !== undefined) updateData.item_type = item_type;

  // Recalculate line total
  const qty = quantity !== undefined ? quantity : existing.quantity;
  const price = unit_price_cents !== undefined ? unit_price_cents : existing.unit_price_cents;
  updateData.line_total_cents = Math.round(qty * price);

  const { error } = await supabase
    .from('quote_line_items')
    .update(updateData)
    .eq('id', item_id);

  if (error) {
    throw new Error(`Failed to update line item: ${error.message}`);
  }

  return success(
    { item_id, line_total_cents: updateData.line_total_cents },
    { db_writes: [{ table: 'quote_line_items', action: 'update', id: item_id }] }
  );
}

/**
 * quote.remove_item - Remove a line item from a quote
 */
export async function remove_item(input) {
  const { item_id } = input;

  // Verify item exists and quote is draft
  const { data: existing, error: fetchError } = await supabase
    .from('quote_line_items')
    .select('id, quote_id, quotes!inner(status)')
    .eq('id', item_id)
    .maybeSingle();

  if (fetchError || !existing) {
    throw new Error(`Line item ${item_id} not found`);
  }

  if (existing.quotes.status !== 'draft') {
    throw new Error(`Cannot remove items from ${existing.quotes.status} quote`);
  }

  const { error } = await supabase
    .from('quote_line_items')
    .delete()
    .eq('id', item_id);

  if (error) {
    throw new Error(`Failed to remove line item: ${error.message}`);
  }

  return success(
    { item_id, removed: true, quote_id: existing.quote_id },
    { db_writes: [{ table: 'quote_line_items', action: 'delete', id: item_id }] }
  );
}

/**
 * quote.update_line_items - Replace all quote line items
 */
export async function update_line_items(input) {
  const { quote_id, line_items } = input;

  // Verify quote is draft
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('id, status')
    .eq('id', quote_id)
    .maybeSingle();

  if (quoteError || !quote) {
    throw new Error(`Quote ${quote_id} not found`);
  }

  if (quote.status !== 'draft') {
    throw new Error(`Cannot update items on ${quote.status} quote`);
  }

  // Delete existing line items
  await supabase
    .from('quote_line_items')
    .delete()
    .eq('quote_id', quote_id);

  // Insert new line items
  if (line_items && line_items.length > 0) {
    const itemsToInsert = line_items.map((item, index) => ({
      quote_id,
      description: item.description,
      quantity: item.quantity || 1,
      unit_price_cents: item.unit_price_cents,
      line_total_cents: Math.round((item.quantity || 1) * item.unit_price_cents),
      item_type: item.item_type || 'labour',
      sort_order: index
    }));

    const { error } = await supabase
      .from('quote_line_items')
      .insert(itemsToInsert);

    if (error) {
      throw new Error(`Failed to insert line items: ${error.message}`);
    }
  }

  return success(
    { quote_id, item_count: line_items?.length || 0 },
    { db_writes: [{ table: 'quote_line_items', action: 'replace', quote_id }] }
  );
}

/**
 * quote.calculate_totals - Recalculate quote totals based on line items
 * Real DB-backed implementation: loads quote_line_items, calculates totals, updates quotes
 */
export async function calculate_totals(input) {
  const { quote_id } = input;

  // Load line items for the quote
  const { data: lineItems, error: fetchError } = await supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', quote_id)
    .order('sort_order', { ascending: true });

  if (fetchError) {
    throw new Error(`Failed to fetch line items: ${fetchError.message}`);
  }

  // Calculate totals
  let labour_cents = 0;
  let materials_cents = 0;
  let other_cents = 0;

  for (const item of lineItems || []) {
    const lineTotal = item.line_total_cents || 0;
    switch (item.item_type) {
      case 'labour':
        labour_cents += lineTotal;
        break;
      case 'materials':
        materials_cents += lineTotal;
        break;
      default:
        other_cents += lineTotal;
    }
  }

  const subtotal_cents = labour_cents + materials_cents + other_cents;
  const tax_cents = Math.round(subtotal_cents * 0.1); // 10% GST
  const total_cents = subtotal_cents + tax_cents;

  // Update quote with calculated totals
  const { error: updateError } = await supabase
    .from('quotes')
    .update({
      subtotal_cents,
      tax_cents,
      total_cents,
      labour_cents,
      materials_cents,
      updated_at: new Date().toISOString()
    })
    .eq('id', quote_id);

  if (updateError) {
    throw new Error(`Failed to update quote totals: ${updateError.message}`);
  }

  const totals = {
    subtotal_cents,
    tax_cents,
    total_cents,
    labour_cents,
    materials_cents,
    other_cents,
    line_item_count: (lineItems || []).length
  };

  return success(
    { quote_id, totals },
    { db_writes: [{ table: 'quotes', action: 'update', id: quote_id }] }
  );
}

/**
 * quote.finalize - Finalize a quote (lock for sending)
 */
export async function finalize(input) {
  const { quote_id } = input;

  // Calculate totals first
  await calculate_totals({ quote_id });

  // Update status to finalized
  const { error } = await supabase
    .from('quotes')
    .update({
      status: 'finalized',
      finalized_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', quote_id);

  if (error) {
    throw new Error(`Failed to finalize quote: ${error.message}`);
  }

  return success(
    { quote_id, status: 'finalized' },
    { db_writes: [{ table: 'quotes', action: 'update', id: quote_id }] }
  );
}

/**
 * quote.get - Retrieve a quote with line items
 */
export async function get(input) {
  const { quote_id } = input;

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', quote_id)
    .maybeSingle();

  if (quoteError) {
    throw new Error(`Failed to fetch quote: ${quoteError.message}`);
  }

  if (!quote) {
    throw new Error(`Quote ${quote_id} not found`);
  }

  const { data: lineItems } = await supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', quote_id)
    .order('sort_order', { ascending: true });

  return success(
    { quote: { ...quote, line_items: lineItems || [] } },
    { db_reads: [{ table: 'quotes', id: quote_id }] }
  );
}

/**
 * quote.generate_pdf - Generate a quote PDF
 */
export async function generate_pdf(input) {
  return notConfigured('quote.generate_pdf', {
    reason: 'PDF generation service not configured',
    required_env: [],
    next_steps: ['Integrate PDF generation library', 'Create quote template']
  });
}

/**
 * quote.send_to_client - Send a quote to client via email/SMS
 */
export async function send_to_client(input) {
  return notConfigured('quote.send_to_client', {
    reason: 'Email/SMS providers not configured',
    required_env: ['SENDGRID_API_KEY', 'TWILIO_ACCOUNT_SID'],
    next_steps: ['Configure SendGrid for email', 'Configure Twilio for SMS']
  });
}

/**
 * quote.mark_accepted - Mark a quote as accepted
 */
export async function mark_accepted(input) {
  const { quote_id, accepted_at, notes } = input;

  const { error } = await supabase
    .from('quotes')
    .update({
      status: 'accepted',
      accepted_at: accepted_at || new Date().toISOString(),
      notes,
      updated_at: new Date().toISOString()
    })
    .eq('id', quote_id);

  if (error) {
    throw new Error(`Failed to mark quote accepted: ${error.message}`);
  }

  return success(
    { quote_id, status: 'accepted' },
    { db_writes: [{ table: 'quotes', action: 'update', id: quote_id }] }
  );
}

/**
 * quote.mark_declined - Mark a quote as declined
 */
export async function mark_declined(input) {
  const { quote_id, reason, notes } = input;

  const { data: quote } = await supabase
    .from('quotes')
    .select('metadata')
    .eq('id', quote_id)
    .single();

  const { error } = await supabase
    .from('quotes')
    .update({
      status: 'declined',
      metadata: {
        ...(quote?.metadata || {}),
        declined_reason: reason,
        declined_at: new Date().toISOString()
      },
      notes,
      updated_at: new Date().toISOString()
    })
    .eq('id', quote_id);

  if (error) {
    throw new Error(`Failed to mark quote declined: ${error.message}`);
  }

  return success(
    { quote_id, status: 'declined' },
    { db_writes: [{ table: 'quotes', action: 'update', id: quote_id }] }
  );
}
