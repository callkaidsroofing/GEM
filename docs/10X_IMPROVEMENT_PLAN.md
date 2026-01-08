# GEM 10x Improvement Plan

**Version**: 1.0.0
**Created**: 2026-01-09
**Status**: ACTIVE

---

## Executive Summary

This plan transforms GEM from a functional tool execution system into a **production-grade, event-driven, multi-agent platform** that's scalable, futureproof, and compatible with enterprise integrations.

### Research Sources Applied

- [AI Agent Orchestration Patterns - Microsoft Azure](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [Multi-Agent Orchestration on AWS](https://aws.amazon.com/solutions/guidance/multi-agent-orchestration-on-aws/)
- [Claude Prompt Engineering Best Practices](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview)
- [Event-Driven Architecture for AI Agents - Confluent](https://www.confluent.io/blog/the-future-of-ai-agents-is-event-driven/)
- [Supabase + LangChain Production Backend](https://bix-tech.com/supabase-langchain-how-to-build-a-production-ready-data-backend-for-intelligent-ai-agents/)
- [GoHighLevel API Documentation](https://marketplace.gohighlevel.com/docs/)
- [MCP November 2025 Spec](https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/)

---

## Part 1: Agent System 10x Improvements

### 1.1 Orchestration Pattern Upgrade

**Current**: Simple sequential execution via Brain → Queue → Executor
**Target**: Supervisor + Adaptive hybrid pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    GEM ORCHESTRATION v2                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐      ┌─────────────────────────────────┐  │
│  │   Message   │      │        BRAIN SUPERVISOR         │  │
│  │   Intake    │─────▶│  ┌─────────┐  ┌─────────────┐  │  │
│  └─────────────┘      │  │ Planner │  │ Agent Router│  │  │
│                       │  └────┬────┘  └──────┬──────┘  │  │
│                       └───────┼──────────────┼─────────┘  │
│                               │              │             │
│               ┌───────────────┼──────────────┼──────────┐ │
│               ▼               ▼              ▼          │ │
│  ┌────────────────┐  ┌────────────┐  ┌──────────────┐  │ │
│  │ gem-pragmatic  │  │ gem-para-  │  │ gem-contract │  │ │
│  │    -shipper    │  │   noid     │  │  -enforcer   │  │ │
│  └───────┬────────┘  └─────┬──────┘  └──────┬───────┘  │ │
│          │                 │                 │          │ │
│          └─────────────────┼─────────────────┘          │ │
│                            ▼                            │ │
│               ┌─────────────────────────┐               │ │
│               │   core_tool_calls       │               │ │
│               │   (Event Queue)         │               │ │
│               └───────────┬─────────────┘               │ │
│                           │                             │ │
│               ┌───────────▼─────────────┐               │ │
│               │     GEM-CORE EXECUTOR   │               │ │
│               │  (Stateless Workers)    │               │ │
│               └───────────┬─────────────┘               │ │
│                           │                             │ │
│               ┌───────────▼─────────────┐               │ │
│               │   core_tool_receipts    │               │ │
│               │   (Event Results)       │               │ │
│               └─────────────────────────┘               │ │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Agent Prompt Structure Upgrade

**Current**: Markdown with embedded rules
**Target**: XML-structured prompts with schema enforcement

```xml
<agent name="gem-pragmatic-shipper">
  <bias>Ship fast, iterate later</bias>
  <constitutional_rules>
    <rule id="1" severity="blocker">
      Registry is law - never contradict tools.registry.json
    </rule>
    <rule id="2" severity="blocker">
      Receipt doctrine - exactly one receipt per call
    </rule>
    <rule id="3" severity="warning">
      Prefer not_configured over unhandled errors
    </rule>
  </constitutional_rules>
  <capabilities>
    <skill ref="handler-skeleton-generate" />
    <skill ref="test-case-generate" />
  </capabilities>
  <output_format>
    <structured_json>true</structured_json>
    <required_fields>["status", "result", "effects"]</required_fields>
  </output_format>
</agent>
```

### 1.3 Agent Invocation Matrix

| Scenario | Primary Agent | Validator | Output |
|----------|---------------|-----------|--------|
| New tool implementation | gem-pragmatic-shipper | gem-paranoid-validator | Handler + Tests |
| Contract change | gem-contract-enforcer | gem-architect-visionary | Registry update |
| Performance issue | gem-performance-hawk | gem-pragmatic-shipper | Optimized code |
| Error message review | gem-user-advocate | gem-paranoid-validator | Improved UX |
| Architecture decision | gem-architect-visionary | gem-contract-enforcer | Design doc |

---

## Part 2: Real-World Application Focus

### 2.1 Call Kaids Roofing Workflow Automation

**Priority 1: Lead-to-Job Pipeline**
```
Lead Created → Inspection Scheduled → Quote Generated →
Job Created → Invoice Sent → Payment Received
```

**Implementation via Skills:**

```yaml
skill: lead-to-job-pipeline
triggers:
  - event: lead.created
    condition: source IN ['gmb', 'google_ads']
steps:
  - tool: leads.update_stage
    input: { lead_id: $lead_id, stage: "contacted" }
  - tool: comms.send_sms
    input: { phone: $phone, template: "initial_contact" }
  - wait: { for: "inspection.scheduled", timeout: "48h" }
  - tool: quote.create_from_inspection
    input: { inspection_id: $inspection_id }
validation_gates:
  - pre: lead.exists AND lead.status != "won"
  - post: quote.created
```

### 2.2 GoHighLevel Integration

**Webhook Receiver Pattern:**

```javascript
// gem-brain/src/webhooks/ghl.js
export async function handleGHLWebhook(payload) {
  // Verify webhook signature
  const verified = verifyGHLSignature(payload, process.env.GHL_WEBHOOK_SECRET);
  if (!verified) return { status: 'rejected', reason: 'invalid_signature' };

  // Map GHL events to GEM tools
  const toolMapping = {
    'ContactCreate': 'leads.create',
    'ContactUpdate': 'leads.update_stage',
    'AppointmentCreate': 'calendar.create_event',
    'OpportunityStageChange': 'leads.update_stage'
  };

  const tool = toolMapping[payload.event];
  if (!tool) return notConfigured('ghl.webhook', {
    reason: `Unmapped event: ${payload.event}`,
    next_steps: ['Add mapping to toolMapping']
  });

  // Enqueue tool call
  return await enqueueTool(tool, mapGHLPayload(payload));
}
```

**Outbound Sync Pattern:**

```javascript
// gem-core/src/integrations/ghl_sync.js
export async function syncToGHL(receipt) {
  if (!process.env.GHL_API_KEY) return; // Silent skip if not configured

  const syncMapping = {
    'leads.create': (r) => ({
      endpoint: '/contacts',
      method: 'POST',
      body: { phone: r.input.phone, name: r.input.name }
    }),
    'leads.update_stage': (r) => ({
      endpoint: `/contacts/${r.input.leadconnector_contact_id}`,
      method: 'PUT',
      body: { customField: { stage: r.input.stage } }
    })
  };

  const sync = syncMapping[receipt.tool_name];
  if (sync) await callGHLAPI(sync(receipt));
}
```

### 2.3 Supabase Real-Time Events

**Enable event-driven triggers:**

```sql
-- Enable Realtime for tool execution events
ALTER PUBLICATION supabase_realtime ADD TABLE core_tool_receipts;

-- Create function for event broadcasting
CREATE OR REPLACE FUNCTION broadcast_receipt_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'tool_receipt',
    json_build_object(
      'tool_name', NEW.tool_name,
      'status', NEW.status,
      'call_id', NEW.call_id
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger
CREATE TRIGGER receipt_broadcast
  AFTER INSERT ON core_tool_receipts
  FOR EACH ROW EXECUTE FUNCTION broadcast_receipt_event();
```

**Client subscription:**

```javascript
// Real-time receipt listener
const subscription = supabase
  .channel('tool-receipts')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'core_tool_receipts'
  }, (payload) => {
    console.log('Receipt received:', payload.new);
    // Trigger downstream workflows
  })
  .subscribe();
```

---

## Part 3: Scalability & Futureproofing

### 3.1 Stateless Worker Architecture

**Current**: Single worker process
**Target**: Horizontally scalable stateless workers

```javascript
// gem-core/index.js (v2)
const WORKER_ID = `worker-${process.env.RENDER_INSTANCE_ID || uuid()}`;

async function claimAndExecute() {
  // Atomic claim prevents race conditions across workers
  const { data: job } = await supabase.rpc('claim_next_core_tool_call', {
    p_worker_id: WORKER_ID
  });

  if (!job) return; // No work available

  try {
    const receipt = await executeHandler(job);
    await writeReceipt(job.id, receipt);
  } catch (error) {
    await writeFailedReceipt(job.id, error);
  }
}

// Event-driven with backpressure
setInterval(claimAndExecute, 1000);
```

### 3.2 Schema Versioning

**Add version tracking to registry:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "version": "2.0.0",
  "compatibility": {
    "min_executor_version": "1.5.0",
    "min_brain_version": "1.3.0"
  },
  "tools": [...]
}
```

**Migration strategy:**

```javascript
// gem-core/src/lib/registry.js
export function loadRegistry() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH));

  // Version compatibility check
  const executorVersion = require('../package.json').version;
  if (!semver.gte(executorVersion, registry.compatibility.min_executor_version)) {
    throw new Error(`Executor ${executorVersion} incompatible with registry ${registry.version}`);
  }

  return registry;
}
```

### 3.3 MCP Integration Preparation

**Future MCP server structure:**

```
gem-mcp/
├── src/
│   ├── server.js           # MCP server implementation
│   ├── tools/              # Tool definitions (from registry)
│   ├── resources/          # Data access patterns
│   └── prompts/            # Skill definitions
├── package.json
└── mcp.config.json
```

**MCP tool exposure:**

```javascript
// gem-mcp/src/tools/index.js
import { registry } from 'gem-core';

export function getMCPTools() {
  return registry.tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input_schema,
    handler: async (input) => {
      // Enqueue to GEM queue, wait for receipt
      const callId = await enqueue(tool.name, input);
      return await waitForReceipt(callId, tool.timeout_ms);
    }
  }));
}
```

### 3.4 Event Sourcing Pattern

**Append-only event log:**

```sql
CREATE TABLE gem_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sequence_number BIGSERIAL
);

CREATE INDEX idx_gem_events_aggregate ON gem_events(aggregate_type, aggregate_id, sequence_number);
CREATE INDEX idx_gem_events_type ON gem_events(event_type, created_at);
```

**Event types:**

```typescript
type GEMEvent =
  | { type: 'ToolCallQueued', payload: { call_id: string, tool_name: string, input: object } }
  | { type: 'ToolCallClaimed', payload: { call_id: string, worker_id: string } }
  | { type: 'ToolCallCompleted', payload: { call_id: string, receipt: Receipt } }
  | { type: 'ToolCallFailed', payload: { call_id: string, error: string } }
  | { type: 'LeadCreated', payload: { lead_id: string, phone: string } }
  | { type: 'QuoteAccepted', payload: { quote_id: string, lead_id: string } }
  | { type: 'JobCreated', payload: { job_id: string, quote_id: string } };
```

---

## Part 4: Code Formatting & Service Compatibility

### 4.1 Standardized Code Style

**.prettierrc.json:**

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true
}
```

**.eslintrc.json:**

```json
{
  "extends": ["eslint:recommended"],
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "env": {
    "node": true,
    "es2022": true
  },
  "rules": {
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn", { "allow": ["error", "warn"] }],
    "prefer-const": "error"
  }
}
```

### 4.2 Service Compatibility Matrix

| Service | Current Status | Integration Type | Priority |
|---------|---------------|------------------|----------|
| Supabase | ✅ Active | Database + Auth + Realtime | P0 |
| GoHighLevel | 🔄 Partial | Webhooks + API | P1 |
| Google Calendar | ❌ Not configured | OAuth + API | P2 |
| Twilio | ❌ Not configured | API | P2 |
| SendGrid | ❌ Not configured | API | P3 |
| Stripe | ❌ Not configured | Webhooks + API | P3 |

### 4.3 Integration Pattern Library

**Standardized integration wrapper:**

```javascript
// gem-core/src/lib/integrations/base.js
export class IntegrationBase {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.configured = this.checkConfiguration();
  }

  checkConfiguration() {
    return this.config.required_env.every(key => process.env[key]);
  }

  async call(method, endpoint, data) {
    if (!this.configured) {
      return {
        status: 'not_configured',
        reason: `${this.name} integration not configured`,
        required_env: this.config.required_env
      };
    }

    try {
      const response = await this.makeRequest(method, endpoint, data);
      return { status: 'succeeded', data: response };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }
}

// gem-core/src/lib/integrations/gohighlevel.js
export class GoHighLevelIntegration extends IntegrationBase {
  constructor() {
    super('GoHighLevel', {
      required_env: ['GHL_API_KEY', 'GHL_LOCATION_ID'],
      base_url: 'https://services.leadconnectorhq.com'
    });
  }

  async createContact(data) {
    return this.call('POST', '/contacts/', data);
  }

  async updateContact(id, data) {
    return this.call('PUT', `/contacts/${id}`, data);
  }
}
```

### 4.4 Error Standardization

**Structured error format:**

```javascript
// gem-core/src/lib/errors.js
export class GEMError extends Error {
  constructor(code, message, context = {}) {
    super(message);
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined
    };
  }
}

export const ErrorCodes = {
  VALIDATION_ERROR: 'E001',
  REGISTRY_NOT_FOUND: 'E002',
  HANDLER_NOT_FOUND: 'E003',
  TIMEOUT: 'E004',
  DATABASE_ERROR: 'E005',
  INTEGRATION_ERROR: 'E006',
  IDEMPOTENCY_VIOLATION: 'E007'
};
```

---

## Part 5: Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

- [ ] Add ESLint + Prettier configuration
- [ ] Implement standardized error codes
- [ ] Add schema versioning to registry
- [ ] Create integration base class
- [ ] Enable Supabase Realtime for receipts

### Phase 2: Agent Upgrade (Week 3-4)

- [ ] Convert agent prompts to XML structure
- [ ] Add skill invocation to agent prompts
- [ ] Implement agent router in Brain
- [ ] Create agent performance metrics

### Phase 3: Integration (Week 5-6)

- [ ] Implement GoHighLevel webhook receiver
- [ ] Create GHL outbound sync
- [ ] Add Google Calendar OAuth flow
- [ ] Implement Twilio SMS handler

### Phase 4: Scale (Week 7-8)

- [ ] Implement event sourcing table
- [ ] Add worker horizontal scaling
- [ ] Create MCP server skeleton
- [ ] Add comprehensive monitoring

---

## Metrics & Success Criteria

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Tool execution time | ~2s avg | <500ms | p95 latency |
| Error rate | ~5% | <1% | Failed receipts / Total |
| Code coverage | 0% | 80% | Jest coverage report |
| Agent accuracy | Unknown | 95% | Correct tool selection |
| Integration uptime | N/A | 99.5% | Uptime monitoring |

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes to registry | High | Schema versioning + compatibility checks |
| GHL API rate limits | Medium | Exponential backoff + queue throttling |
| Worker race conditions | High | FOR UPDATE SKIP LOCKED + idempotency |
| Agent hallucination | Medium | Grounded prompts + validation gates |
| Database scaling | Medium | Connection pooling + read replicas |

---

## Appendix: Agent Family Enhancement

### Updated Agent Frontmatter Template

```yaml
---
name: gem-{agent-name}
description: |
  {Extended description with examples}
model: sonnet|opus|haiku
color: {color}
tools:
  - Read
  - Write
  - Grep
  - Bash
skills:
  - handler-skeleton-generate
  - contract-drift-detect
constitutional_rules:
  - Registry is law
  - Receipt doctrine
  - Idempotency enforcement
output_format: structured_json
---
```

### Skills Enhancement

Convert all 5 skills to include:

1. **Pre-validation gates** - Check preconditions before execution
2. **Structured output schema** - JSON Schema for outputs
3. **Metrics collection** - Execution time, success rate
4. **Agent routing hints** - Which agents can invoke

---

*This plan is a living document. Update as implementation progresses.*
