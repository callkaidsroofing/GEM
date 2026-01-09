# GEM Brain

> For system overview, see `/docs/SYSTEM.md`. For constraints, see `/docs/CONSTRAINTS.md`.

The Brain is the AI interaction layer for GEM. It translates natural language messages into registry-valid tool calls, enqueues them to Supabase, and optionally waits for execution receipts.

## Architecture

```
┌─────────────────────┐
│  User Message       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  GEM Brain          │  ← Plans, validates, enqueues
│  (gem-brain/)       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  core_tool_calls    │  ← Queued for executor
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  GEM-CORE Executor  │  ← Executes, writes receipts
│  (gem-core/)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  core_tool_receipts │  ← Brain can poll for results
└─────────────────────┘
```

## Contract

### BrainRunRequest

```json
{
  "message": "string",
  "mode": "answer" | "plan" | "enqueue" | "enqueue_and_wait",
  "conversation_id": "uuid|null",
  "context": {
    "lead_id": "uuid",
    "job_id": "uuid",
    "quote_id": "uuid"
  },
  "limits": {
    "max_tool_calls": 10,
    "wait_timeout_ms": 30000
  }
}
```

### BrainRunResponse

```json
{
  "ok": true,
  "run_id": "uuid",
  "decision": {
    "mode_used": "enqueue_and_wait",
    "reason": "Matched rule pattern for os.create_task"
  },
  "planned_tool_calls": [
    {
      "tool_name": "os.create_task",
      "input": {"title": "Test", "domain": "business"},
      "idempotency_key": null
    }
  ],
  "enqueued": [
    {"call_id": "uuid", "tool_name": "os.create_task"}
  ],
  "receipts": [
    {
      "call_id": "uuid",
      "tool_name": "os.create_task",
      "status": "succeeded",
      "result": {"task_id": "uuid"},
      "effects": {}
    }
  ],
  "assistant_message": "Executed 1/1 tool calls. 1 succeeded.",
  "next_actions": ["Task created: uuid"],
  "errors": []
}
```

## Modes

| Mode | Behavior |
|------|----------|
| `answer` | Plan only, return what would be executed without enqueueing |
| `plan` | Plan and return for approval, do not enqueue |
| `enqueue` | Plan, validate, enqueue to Supabase, return immediately |
| `enqueue_and_wait` | Plan, validate, enqueue, wait for receipts, return results |

## Database Table

### brain_runs

Tracks every Brain request for audit and debugging.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| created_at | TIMESTAMPTZ | Request timestamp |
| message | TEXT | Original message |
| mode | TEXT | Requested mode |
| conversation_id | UUID | Optional conversation reference |
| context | JSONB | Context (lead_id, job_id, quote_id) |
| limits | JSONB | Request limits |
| decision | JSONB | Planning decision |
| planned_tool_calls | JSONB | Tool calls planned |
| enqueued_call_ids | UUID[] | IDs of enqueued calls |
| status | TEXT | created/planning/enqueued/waiting/completed/failed |
| assistant_message | TEXT | Response message |
| next_actions | JSONB | Suggested next actions |
| receipts | JSONB | Collected receipts |
| error | JSONB | Error details if failed |

## Rules-First Planner

The Brain uses a rules-first planner that maps messages to tool calls without requiring an LLM.

### Supported Patterns

#### OS Domain
| Pattern | Tool |
|---------|------|
| "system status", "health check" | os.health_check |
| "create note: [content]" | os.create_note |
| "create task: [title]" | os.create_task |
| "complete task [uuid]" | os.complete_task |
| "list tasks" | os.list_tasks |
| "search notes for [query]" | os.search_notes |

#### Leads Domain
| Pattern | Tool |
|---------|------|
| "new lead: [name] [phone] in [suburb]" | leads.create |
| "list leads" | leads.list_by_stage |

#### Inspection Domain
| Pattern | Tool |
|---------|------|
| "create inspection for lead [uuid]" | inspection.create |
| "add measurement to [uuid]: [description] [value] [unit]" | inspection.add_measurement |
| "add defect to [uuid]: [description] [severity]" | inspection.add_defect |
| "add photo to [uuid]: [file_ref]" | inspection.add_photo_ref |
| "submit inspection [uuid]" | inspection.submit |

#### Quote Domain
| Pattern | Tool |
|---------|------|
| "create quote from inspection [uuid]" | quote.create_from_inspection |
| "add item to quote [uuid]: [qty]x [desc] $[price]" | quote.add_item |
| "calculate totals [quote_id]" | quote.calculate_totals |
| "finalize quote [uuid]" | quote.finalize |

### Confidence Levels

- **high**: Pattern matched exactly, parameters extracted correctly
- **medium**: Pattern matched but some parameters inferred/defaulted
- **low**: Ambiguous match
- **none**: No matching rule found

If confidence is `none`, Brain returns an answer-mode response with help text.

## Failure Modes

### Validation Failure
- Input doesn't match registry schema
- Response: `ok=false`, `errors` contains validation details
- No tool calls enqueued

### Unknown Tool
- Tool name not in registry (shouldn't happen with rules planner)
- Response: `ok=false`, `errors` contains unknown_tool error

### Enqueue Failure
- Database error when inserting to core_tool_calls
- Response: partial success, `enqueued` shows what succeeded

### Timeout
- enqueue_and_wait mode: receipts not received within timeout
- Response: `ok=false`, `receipts` shows what was received, `assistant_message` notes pending calls

### Internal Error
- Unexpected exception
- Response: `ok=false`, `errors` contains stack trace
- brain_run marked as failed

## Registry Guardrails

1. Brain only enqueues tools found in `tools.registry.json`
2. Input is validated against registry schema before enqueueing
3. Invalid input returns validation error without enqueueing
4. Tool names and schemas are never modified

## LLM Integration (Optional)

The Brain is designed to work without an LLM. LLM integration can be added behind an interface:

```javascript
// Optional LLM planner (not implemented in MVP)
import { planFromLLM } from './planner/llm.js';

// If no LLM configured, falls back to rules
const useLLM = process.env.LLM_API_KEY && process.env.LLM_ENABLED === 'true';
```

When LLM is not configured, the rules-first planner handles all requests.

---

*This document defines Brain behavior and should be updated with any changes.*
