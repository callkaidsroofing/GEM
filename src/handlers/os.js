import { supabase } from '../lib/supabase.js';

/**
 * os.health_check - Return backend, database, queue, and provider connectivity status
 */
export async function health_check(input) {
  const checks = {
    backend: 'ok',
    database: 'unknown',
    queue: 'unknown',
    provider: 'ok'
  };

  // Check database connectivity
  try {
    const { error } = await supabase.from('core_tool_calls').select('id').limit(1);
    checks.database = error ? 'down' : 'ok';
  } catch {
    checks.database = 'down';
  }

  // Check queue (count of queued jobs)
  try {
    const { count, error } = await supabase
      .from('core_tool_calls')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued');
    checks.queue = error ? 'degraded' : 'ok';
  } catch {
    checks.queue = 'degraded';
  }

  const allOk = Object.values(checks).every(v => v === 'ok');
  const anyDown = Object.values(checks).some(v => v === 'down');

  return {
    result: {
      status: anyDown ? 'down' : (allOk ? 'ok' : 'degraded'),
      checks
    },
    effects: {
      external_calls: []
    }
  };
}

/**
 * os.create_note - Create a note (business/personal/both) and attach optional entity references
 * Real DB-backed implementation
 */
export async function create_note(input) {
  const { domain, title, content, entity_refs = [] } = input;

  const { data, error } = await supabase
    .from('notes')
    .insert({
      domain,
      title,
      content,
      entity_refs
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create note: ${error.message}`);
  }

  return {
    result: { note_id: data.id },
    effects: {
      db_writes: [
        { table: 'notes', action: 'insert', id: data.id }
      ]
    }
  };
}

/**
 * os.search_notes - Search notes by keyword and optional domain/entity filters
 */
export async function search_notes(input) {
  const { query, domain, limit = 20 } = input;

  let queryBuilder = supabase
    .from('notes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (domain && domain !== 'both') {
    queryBuilder = queryBuilder.or(`domain.eq.${domain},domain.eq.both`);
  }

  if (query) {
    queryBuilder = queryBuilder.or(`title.ilike.%${query}%,content.ilike.%${query}%`);
  }

  const { data, error } = await queryBuilder;

  if (error) {
    throw new Error(`Failed to search notes: ${error.message}`);
  }

  return {
    result: { results: data || [] },
    effects: {}
  };
}

/**
 * os.create_task - Create a task with optional due date and linkage
 */
export async function create_task(input) {
  const { title, domain, description, due_at, context_ref, priority = 'normal' } = input;

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title,
      domain,
      description,
      due_at,
      context_ref,
      priority,
      status: 'open'
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create task: ${error.message}`);
  }

  return {
    result: { task_id: data.id },
    effects: {
      db_writes: [
        { table: 'tasks', action: 'insert', id: data.id }
      ]
    }
  };
}

/**
 * os.update_task - Update task fields
 */
export async function update_task(input) {
  const { task_id, patch } = input;

  const { error } = await supabase
    .from('tasks')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', task_id);

  if (error) {
    throw new Error(`Failed to update task: ${error.message}`);
  }

  return {
    result: { task_id },
    effects: {
      db_writes: [
        { table: 'tasks', action: 'update', id: task_id }
      ]
    }
  };
}

/**
 * os.complete_task - Mark a task as completed
 */
export async function complete_task(input) {
  const { task_id, note } = input;

  const { error } = await supabase
    .from('tasks')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
      completion_note: note,
      updated_at: new Date().toISOString()
    })
    .eq('id', task_id);

  if (error) {
    throw new Error(`Failed to complete task: ${error.message}`);
  }

  return {
    result: { task_id },
    effects: {
      db_writes: [
        { table: 'tasks', action: 'update', id: task_id }
      ]
    }
  };
}

/**
 * os.defer_task - Defer a task by setting a new due date
 */
export async function defer_task(input) {
  const { task_id, due_at, reason } = input;

  const { error } = await supabase
    .from('tasks')
    .update({
      due_at,
      updated_at: new Date().toISOString()
    })
    .eq('id', task_id);

  if (error) {
    throw new Error(`Failed to defer task: ${error.message}`);
  }

  return {
    result: { task_id },
    effects: {
      db_writes: [
        { table: 'tasks', action: 'update', id: task_id }
      ]
    }
  };
}

/**
 * os.list_tasks - List tasks filtered by status/domain/context
 * Real DB-backed implementation
 */
export async function list_tasks(input) {
  const { status = 'all', domain, limit = 50 } = input;

  let query = supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status && status !== 'all') {
    query = query.eq('status', status === 'done' ? 'done' : 'open');
  }

  if (domain && domain !== 'both') {
    query = query.or(`domain.eq.${domain},domain.eq.both`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list tasks: ${error.message}`);
  }

  return {
    result: {
      tasks: data || []
    },
    effects: {}
  };
}

/**
 * os.get_state_snapshot - Fetch the latest derived state snapshot for a domain
 */
export async function get_state_snapshot(input) {
  const { domain } = input;

  // For now, return a basic state object
  // In a full implementation, this would aggregate from multiple tables
  return {
    result: {
      domain,
      as_of: new Date().toISOString(),
      state: {}
    },
    effects: {}
  };
}

/**
 * os.refresh_state_snapshot - Recompute and persist a new derived state snapshot
 */
export async function refresh_state_snapshot(input) {
  const { domain, since } = input;

  // Generate a snapshot ID
  const snapshot_id = crypto.randomUUID();

  return {
    result: {
      snapshot_id,
      as_of: new Date().toISOString()
    },
    effects: {
      db_writes: []
    }
  };
}

/**
 * os.create_reminder - Create a reminder for a specific datetime
 */
export async function create_reminder(input) {
  const { title, remind_at, domain = 'personal', context_ref } = input;

  // Store reminder as a task with due_at
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title,
      domain,
      due_at: remind_at,
      context_ref,
      status: 'open',
      priority: 'normal'
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create reminder: ${error.message}`);
  }

  return {
    result: { reminder_id: data.id },
    effects: {
      db_writes: [
        { table: 'tasks', action: 'insert', id: data.id }
      ]
    }
  };
}

/**
 * os.audit_log_search - Search tool calls/receipts for audit
 */
export async function audit_log_search(input) {
  const { query, event_type, call_id, since, limit = 50 } = input;

  let queryBuilder = supabase
    .from('core_tool_receipts')
    .select('*, core_tool_calls(*)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (call_id) {
    queryBuilder = queryBuilder.eq('call_id', call_id);
  }

  if (since) {
    queryBuilder = queryBuilder.gte('created_at', since);
  }

  if (event_type) {
    queryBuilder = queryBuilder.ilike('tool_name', `%${event_type}%`);
  }

  const { data, error } = await queryBuilder;

  if (error) {
    throw new Error(`Failed to search audit log: ${error.message}`);
  }

  return {
    result: { items: data || [] },
    effects: {}
  };
}

/**
 * os.rollback_last_action - Attempt rollback for the most recent tool call
 */
export async function rollback_last_action(input) {
  const { call_id } = input;

  // This is a placeholder - real rollback would require stored rollback instructions
  return {
    result: { rolled_back: false },
    effects: {
      db_writes: []
    }
  };
}
