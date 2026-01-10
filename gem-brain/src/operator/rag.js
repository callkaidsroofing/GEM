/**
 * CKR-GEM Operator RAG (Retrieval Augmented Generation)
 *
 * Queries Supabase to retrieve relevant context for LLM prompts.
 * Searches leads, tasks, jobs, quotes, inspections, and notes.
 */

import { supabase } from '../lib/supabase.js';

/**
 * RAG Query Manager
 */
export class OperatorRAG {
  constructor(config = {}) {
    this.config = config;
    this.maxResults = config.maxResults || 5;
    this.cacheTimeout = config.cacheTimeout || 60000; // 1 minute
    this.cache = new Map();
  }

  /**
   * Query all relevant entities based on message context
   */
  async query(message, context = {}) {
    const results = {
      leads: [],
      tasks: [],
      jobs: [],
      quotes: [],
      inspections: [],
      notes: [],
      recent_activity: []
    };

    try {
      // Extract potential search terms from message
      const searchTerms = this._extractSearchTerms(message);
      const phoneMatch = message.match(/0\d{9}/);
      const nameMatch = message.match(/(?:for|from|named?|about)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      const idMatch = message.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);

      // Run queries in parallel for efficiency
      const queries = [];

      // If we have specific IDs from context, fetch those first
      if (context.lead_id) {
        queries.push(this._fetchLead(context.lead_id).then(l => { if (l) results.leads.push(l); }));
      }
      if (context.task_id) {
        queries.push(this._fetchTask(context.task_id).then(t => { if (t) results.tasks.push(t); }));
      }
      if (context.job_id) {
        queries.push(this._fetchJob(context.job_id).then(j => { if (j) results.jobs.push(j); }));
      }

      // Search by phone number
      if (phoneMatch) {
        queries.push(this._searchLeadsByPhone(phoneMatch[0]).then(l => results.leads.push(...l)));
      }

      // Search by name
      if (nameMatch) {
        queries.push(this._searchLeadsByName(nameMatch[1]).then(l => results.leads.push(...l)));
      }

      // Search by UUID if found
      if (idMatch) {
        queries.push(this._searchById(idMatch[1]).then(r => {
          if (r.type === 'lead') results.leads.push(r.data);
          else if (r.type === 'task') results.tasks.push(r.data);
          else if (r.type === 'job') results.jobs.push(r.data);
        }));
      }

      // Get recent activity
      queries.push(this._getRecentActivity().then(a => results.recent_activity = a));

      // Search tasks by keywords
      if (searchTerms.length > 0) {
        queries.push(this._searchTasks(searchTerms[0]).then(t => results.tasks.push(...t)));
        queries.push(this._searchNotes(searchTerms[0]).then(n => results.notes.push(...n)));
      }

      await Promise.all(queries);

      // Deduplicate
      results.leads = this._deduplicate(results.leads, 'id');
      results.tasks = this._deduplicate(results.tasks, 'id');
      results.jobs = this._deduplicate(results.jobs, 'id');

      return results;
    } catch (error) {
      console.warn('[RAG] Query failed:', error.message);
      return results;
    }
  }

  /**
   * Build context block for LLM from RAG results
   */
  buildContextBlock(ragResults) {
    const lines = [];

    if (ragResults.leads.length > 0) {
      lines.push('RELEVANT LEADS:');
      ragResults.leads.slice(0, 3).forEach(l => {
        lines.push(`  - ${l.name || 'Unknown'} (${l.phone || 'no phone'}) - ${l.suburb || ''} - Stage: ${l.stage || l.status || 'unknown'}`);
        if (l.id) lines.push(`    ID: ${l.id}`);
      });
    }

    if (ragResults.tasks.length > 0) {
      lines.push('RELEVANT TASKS:');
      ragResults.tasks.slice(0, 3).forEach(t => {
        lines.push(`  - ${t.title || t.description || 'Untitled'} - Status: ${t.status || 'unknown'}`);
        if (t.id) lines.push(`    ID: ${t.id}`);
      });
    }

    if (ragResults.jobs.length > 0) {
      lines.push('RELEVANT JOBS:');
      ragResults.jobs.slice(0, 3).forEach(j => {
        lines.push(`  - Job ${j.job_number || j.id} - Status: ${j.status || 'unknown'}`);
      });
    }

    if (ragResults.quotes.length > 0) {
      lines.push('RELEVANT QUOTES:');
      ragResults.quotes.slice(0, 3).forEach(q => {
        lines.push(`  - Quote ${q.id?.slice(0, 8)} - $${(q.total_amount_cents || 0) / 100} - Status: ${q.status || 'unknown'}`);
      });
    }

    if (ragResults.recent_activity.length > 0) {
      lines.push('RECENT SYSTEM ACTIVITY:');
      ragResults.recent_activity.slice(0, 5).forEach(a => {
        lines.push(`  - ${a.tool_name}: ${a.status} @ ${new Date(a.created_at).toLocaleString('en-AU')}`);
      });
    }

    return lines.join('\n');
  }

  // Private methods

  async _fetchLead(id) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, name, phone, email, suburb, stage, created_at')
      .eq('id', id)
      .maybeSingle();

    return error ? null : data;
  }

  async _fetchTask(id) {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, description, status, priority, due_date')
      .eq('id', id)
      .maybeSingle();

    return error ? null : data;
  }

  async _fetchJob(id) {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, job_number, lead_id, status, scheduled_start')
      .eq('id', id)
      .maybeSingle();

    return error ? null : data;
  }

  async _searchLeadsByPhone(phone) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, name, phone, email, suburb, stage')
      .ilike('phone', `%${phone.replace(/\s/g, '')}%`)
      .limit(this.maxResults);

    return error ? [] : data;
  }

  async _searchLeadsByName(name) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, name, phone, email, suburb, stage')
      .ilike('name', `%${name}%`)
      .limit(this.maxResults);

    return error ? [] : data;
  }

  async _searchTasks(keyword) {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, description, status, priority')
      .or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%`)
      .order('created_at', { ascending: false })
      .limit(this.maxResults);

    return error ? [] : data;
  }

  async _searchNotes(keyword) {
    const { data, error } = await supabase
      .from('notes')
      .select('id, title, content, domain')
      .or(`title.ilike.%${keyword}%,content.ilike.%${keyword}%`)
      .order('created_at', { ascending: false })
      .limit(this.maxResults);

    return error ? [] : data;
  }

  async _searchById(uuid) {
    // Try leads first
    const { data: lead } = await supabase
      .from('leads')
      .select('id, name, phone, suburb, stage')
      .eq('id', uuid)
      .maybeSingle();

    if (lead) return { type: 'lead', data: lead };

    // Try tasks
    const { data: task } = await supabase
      .from('tasks')
      .select('id, title, status, priority')
      .eq('id', uuid)
      .maybeSingle();

    if (task) return { type: 'task', data: task };

    // Try jobs
    const { data: job } = await supabase
      .from('jobs')
      .select('id, job_number, status')
      .eq('id', uuid)
      .maybeSingle();

    if (job) return { type: 'job', data: job };

    return { type: null, data: null };
  }

  async _getRecentActivity() {
    const { data, error } = await supabase
      .from('core_tool_calls')
      .select('id, tool_name, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    return error ? [] : data;
  }

  _extractSearchTerms(message) {
    // Remove common words and extract meaningful terms
    const stopWords = ['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
      'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under',
      'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
      'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
      'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
      'create', 'add', 'new', 'make', 'get', 'find', 'show', 'list', 'what', 'which'];

    const words = message.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.includes(w));

    return words;
  }

  _deduplicate(arr, key) {
    const seen = new Set();
    return arr.filter(item => {
      if (!item || !item[key] || seen.has(item[key])) return false;
      seen.add(item[key]);
      return true;
    });
  }
}

/**
 * Shared RAG instance
 */
let sharedRAG = null;

export function getSharedRAG(config = {}) {
  if (!sharedRAG) {
    sharedRAG = new OperatorRAG(config);
  }
  return sharedRAG;
}
