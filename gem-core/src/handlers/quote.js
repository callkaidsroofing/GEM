import { supabase } from '../lib/supabase.js';

/**
 * quote.create_from_inspection - Create a quote draft from a locked inspection
 */
export async function create_from_inspection(input) {
  const { inspection_id, pricing_profile, notes } = input;

  const { data, error } = await supabase
    .from('quotes')
    .insert({
      inspection_id,
      status: 'draft',
      notes
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create quote: ${error.message}`);
  }

  return {
    result: { quote_id: data.id },
    effects: {
      db_writes: [
        { table: 'quotes', action: 'insert', id: data.id }
      ]
    }
  };
}

/**
 * quote.update_line_items - Update quote line items
 */
export async function update_line_items(input) {
  const { quote_id, line_items } = input;

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

  return {
    result: { quote_id },
    effects: {
      db_writes: [
        { table: 'quote_line_items', action: 'replace', quote_id }
      ]
    }
  };
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
    line_item_count: (lineItems || []).length
  };

  return {
    result: { totals },
    effects: {
      db_writes: [
        { table: 'quotes', action: 'update', id: quote_id }
      ]
    }
  };
}

/**
 * quote.generate_pdf - Generate a quote PDF
 */
export async function generate_pdf(input) {
  const { quote_id, template = 'standard' } = input;

  // Placeholder: In real implementation, this would generate a PDF
  const file_ref = `quotes/${quote_id}/quote-${Date.now()}.pdf`;

  return {
    result: { file_ref },
    effects: {
      files_written: [file_ref]
    }
  };
}

/**
 * quote.send_to_client - Send a quote to client via email/SMS
 */
export async function send_to_client(input) {
  const { quote_id, channel, email, phone, message_override } = input;

  // Placeholder: Would integrate with actual email/SMS providers
  return {
    result: { sent: true },
    effects: {
      messages_sent: [{ channel, quote_id }],
      db_writes: [
        { table: 'quotes', action: 'update', id: quote_id }
      ]
    }
  };
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

  return {
    result: { quote_id },
    effects: {
      db_writes: [
        { table: 'quotes', action: 'update', id: quote_id }
      ]
    }
  };
}

/**
 * quote.mark_declined - Mark a quote as declined
 */
export async function mark_declined(input) {
  const { quote_id, reason, notes } = input;

  const { error } = await supabase
    .from('quotes')
    .update({
      status: 'declined',
      declined_at: new Date().toISOString(),
      declined_reason: reason,
      notes,
      updated_at: new Date().toISOString()
    })
    .eq('id', quote_id);

  if (error) {
    throw new Error(`Failed to mark quote declined: ${error.message}`);
  }

  return {
    result: { quote_id },
    effects: {
      db_writes: [
        { table: 'quotes', action: 'update', id: quote_id }
      ]
    }
  };
}
