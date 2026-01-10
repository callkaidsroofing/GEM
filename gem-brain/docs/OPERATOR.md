# CKR-GEM Operator Model

## Overview

The CKR-GEM Operator is the system intelligence layer that implements a strict 4-layer execution model for Call Kaids Roofing's GEM platform. It translates natural language into schema-valid, auditable tool executions while enforcing safety, approval, and contract correctness.

**Core Principle**: Never collapse layers. Each layer has distinct responsibilities and cannot be bypassed.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    NATURAL LANGUAGE INPUT                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: JUDGEMENT                                         │
│  ─────────────────────────────────────────────────────────  │
│  • Parse intent                                             │
│  • Classify operational domain                              │
│  • Assess risk tier (T0-T4)                                 │
│  • Identify required tools                                  │
│  • Check directive conflicts                                │
│  ─────────────────────────────────────────────────────────  │
│  Output: IntentClassification                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2: SKILLS (Deterministic)                           │
│  ─────────────────────────────────────────────────────────  │
│  • Generate schema-valid artifacts                          │
│  • Order tool sequences                                     │
│  • Extract dependencies                                     │
│  • Validate against registry                                │
│  • No execution, only artefacts                             │
│  ─────────────────────────────────────────────────────────  │
│  Output: RunPlan                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                     [QUALITY GATE CHECK]
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3: BRAIN (Orchestration)                            │
│  ─────────────────────────────────────────────────────────  │
│  • Enqueue validated tool calls                             │
│  • Manage execution context                                 │
│  • Track progress                                           │
│  • Delegates to existing brain.js                           │
│  ─────────────────────────────────────────────────────────  │
│  Output: Enqueued tool calls                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 4: WORKER (Execution)                               │
│  ─────────────────────────────────────────────────────────  │
│  • Execute handlers                                         │
│  • Write receipts                                           │
│  • Prove outcomes                                           │
│  • Handled by gem-core                                      │
│  ─────────────────────────────────────────────────────────  │
│  Output: Receipts                                           │
└─────────────────────────────────────────────────────────────┘
```

## Prime Directives (Non-Negotiable)

Always obey, in this order:

1. **Safety, confidentiality, and legal compliance**
2. **Contract correctness** (tools.registry.json is LAW)
3. **Operational continuity** (Render worker + queue stability)
4. **Revenue flow** (lead → inspection → quote → job → payment → review)
5. **Brand integrity** (Call Kaids Roofing)
6. **User intent and speed**

If a request conflicts with a higher directive, the operator MUST refuse with reasons.

## Risk & Approval Model

| Tier | Meaning | Approval Required | Examples |
|------|---------|-------------------|----------|
| **T0** | Read / Analysis | No | `os.health_check`, `leads.list_by_stage`, `os.search_notes` |
| **T1** | Local Artifact Generation | No | `os.create_task`, `os.create_note`, `leads.create` |
| **T2** | Repo or Schema Change | **Yes** | `quote.finalize`, `inspection.submit` |
| **T3** | External Communications | **Yes** | `sms.send`, `email.send_quote` |
| **T4** | Irreversible / Production DB | **Yes** | `invoice.void`, `job.cancel` |

**Approval Format**: `APPROVE: <action_id>`

Operations requiring approval will halt before Layer 3 execution unless `explicit_approval=true` is provided.

## Operational Domains

The operator classifies all intents into operational domains:

| Domain | Description | Example Tools | Default Risk |
|--------|-------------|---------------|--------------|
| **lead** | Lead Management | `leads.*` | T1 |
| **inspection** | Inspection Workflow | `inspection.*`, `media.*` | T1 |
| **quote** | Quote Management | `quote.*` | T2 |
| **task** | Task Management | `os.*_task` | T0 |
| **note** | Note Management | `os.*_note` | T0 |
| **job** | Job Workflow | `job.*` | T2 |
| **invoice** | Invoice Management | `invoice.*` | T3 |
| **comms** | Communications | `comms.*`, `sms.*`, `email.*` | T3 |
| **devops** | System Operations | `os.health_check`, `os.*_snapshot` | T0 |
| **system** | System Intelligence | `os.*` | T0 |

## Intent Classification

Layer 1 uses LLM to classify intents. Output structure:

```json
{
  "intent": "execute" | "refuse" | "clarify",
  "domain": "lead | inspection | quote | task | ...",
  "urgency": "low | normal | high | critical",
  "tool_candidates": ["tool.name1", "tool.name2"],
  "required_fields": ["field1", "field2"],
  "missing_evidence": ["lead_id", "phone"],
  "risk_tier": "T0 | T1 | T2 | T3 | T4",
  "risk_reason": "Why this tier?",
  "confidence": 0.85,
  "reasoning": "Brief explanation"
}
```

### Intent Types

- **execute**: Clear intent, tools identified, evidence sufficient
- **refuse**: Cannot or should not execute (safety, missing tools, directive conflict)
- **clarify**: Ambiguous intent, needs more information

## Run Plans

Layer 2 generates Run Plans (ordered, validated tool sequences):

```json
{
  "plan_id": "uuid",
  "classification_id": "uuid",
  "status": "ready | rejected | awaiting_approval",
  "domain": "inspection",
  "tool_sequence": [
    "media.create_asset",
    "inspection.create",
    "inspection.add_items",
    "inspection.generate_scope_summary"
  ],
  "dependencies": [
    {
      "tool": "inspection.add_items",
      "depends_on": "inspection.create",
      "reason": "Required predecessor"
    }
  ],
  "estimated_risk": "T1",
  "requires_approval": false,
  "required_fields": ["lead_id", "site_address"],
  "missing_evidence": [],
  "confidence": 0.9
}
```

## Quality Gate

Before Layer 3 execution, the Quality Gate checks:

```javascript
{
  schema_correct: true,         // Tools exist and have valid schemas
  provable_by_receipt: true,    // Tools define receipt_fields
  worker_safe: true,            // No experimental/unsafe tools
  approval_obtained: true,      // If required, approval provided
  safer_alternative: null       // Suggest if available
}
```

**Rule**: If any check fails, execution is blocked.

## Structured Output Contract

Every operator response MUST follow this structure:

```
[INTENT]
Domain: <domain>
Intent: <execute|refuse|clarify>
Confidence: <percentage>
Reasoning: <brief explanation>

[PLAN or RESULT]
<Either execution plan OR results summary>

[TOOL IMPACT]
<Which tools involved or executed>

[RISKS / GATES]
Risk tier: <T0-T4>
<Approval required or not>
Risk reason: <explanation>

[NEXT ACTIONS]
  1. <Actionable step>
  2. <Actionable step>
```

No fluff. No roleplay. Deterministic and proof-driven.

## Usage

### Basic Usage

```javascript
import { createOperator } from './src/operator/orchestrator.js';

const operator = createOperator({
  openrouter_api_key: process.env.OPENROUTER_API_KEY
});

// Analyze intent only
const result = await operator.process({
  message: 'create a task to call John',
  mode: 'analyze'
});

// Generate execution plan
const result = await operator.process({
  message: 'new lead: Sarah 0400123456 in Clayton',
  mode: 'plan'
});

// Execute with approval
const result = await operator.process({
  message: 'finalize quote abc123',
  mode: 'execute',
  explicit_approval: true,
  context: { quote_id: 'abc123' }
});
```

### CLI Usage

```bash
# Analyze intent
node scripts/operator-cli.js "system status"

# Generate plan
node scripts/operator-cli.js -m "create task: review quotes" -M plan

# Execute with approval
node scripts/operator-cli.js -m "finalize quote abc123" -M execute --approve

# Interactive mode
node scripts/operator-cli.js --interactive
```

### Interactive Mode

```bash
$ node scripts/operator-cli.js --interactive

operator> system status
[Intent classification and plan displayed]

operator> :mode execute
Mode set to: execute

operator> :approve
Approval flag: true

operator> new lead: John 0400111222 in Mulgrave
[Execution proceeds with approval]

operator> :quit
```

## Execution Modes

| Mode | Layer 1 | Layer 2 | Layer 3 | Layer 4 | Description |
|------|---------|---------|---------|---------|-------------|
| **analyze** | ✓ | ✓ | ✗ | ✗ | Classification + plan only |
| **plan** | ✓ | ✓ | ✗ | ✗ | Full plan with verification SQL |
| **enqueue** | ✓ | ✓ | ✓ | (async) | Queue tools, don't wait |
| **enqueue_and_wait** | ✓ | ✓ | ✓ | ✓ | Queue and wait for results |
| **execute** | ✓ | ✓ | ✓ | ✓ | Full execution (requires approval for T2+) |

## Multimodal Inspection (Canonical Workflow)

The operator treats `inspection_packet_v1` as canonical:

```javascript
// User provides inspection data (photos, measurements, defects)
const result = await operator.process({
  message: 'create inspection with packet data',
  mode: 'execute',
  context: {
    inspection_packet: { /* packet v1 format */ }
  }
});

// Operator orchestrates:
// 1. media.create_asset (for each photo)
// 2. inspection.create
// 3. inspection.add_items (measurements + defects)
// 4. inspection.generate_scope_summary
// 5. Worker executes and writes receipts
// 6. Brain reports progress
```

Never bypass this pipeline.

## Error Handling

### Directive Conflicts

If a request conflicts with a Prime Directive:

```
[INTENT]
Intent: refuse
Reasoning: Directive conflict - operation endangers worker stability

[RISKS / GATES]
Conflicting directive: operational_continuity
Severity: blocking
```

### Missing Evidence

If required data is missing:

```
[INTENT]
Intent: clarify
Reasoning: Insufficient evidence to proceed

[NEXT ACTIONS]
  1. Provide missing: phone, suburb
```

### Quality Gate Failure

If quality checks fail:

```
[PLAN]
Status: quality_gate_failed
Reason: Schema validation failed for tool quote.finalize

[RISKS / GATES]
Schema correct: false
```

## Integration with Existing Brain

The operator delegates to existing `brain.js` for Layer 3:

```javascript
// Operator (Layer 1-2)
const runPlan = artifactGen.generateRunPlan(intent);

// Delegate to brain.js (Layer 3)
const brainRequest = {
  message: originalMessage,
  mode: 'enqueue_and_wait',
  context,
  limits: { max_tool_calls: runPlan.tool_sequence.length }
};

const brainResponse = await runBrain(brainRequest);
```

This ensures:
- No duplication of orchestration logic
- Existing brain rules still apply
- Receipts flow through established patterns

## Examples

See `gem-brain/examples/operator-examples.js` for comprehensive demonstrations.

## Environment Variables

```bash
# Required for Layer 1 (Intent Classification)
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet  # Optional

# Required for Layers 3-4 (Orchestration & Execution)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Design Principles

1. **Decisions are cheap. Execution is sacred. Receipts are truth.**
2. **Never invent schemas, tools, or fields**
3. **No silent success - every execution must have a receipt**
4. **No "best effort" - validate before execution**
5. **Protect the system, not impress the user**
6. **If ambiguity exists → STOP and REFUSE**

## Limitations

1. **No execution without receipts** - Can't verify = can't execute
2. **No tool invention** - Registry defines all available tools
3. **No schema guessing** - Missing fields = refusal or clarification
4. **No approval shortcuts** - T2+ requires explicit approval
5. **No layer collapse** - Must progress through all layers in order

## Future Enhancements

- [ ] Skill packs for complex workflows
- [ ] Multi-agent approval chains
- [ ] Execution rollback for T4 operations
- [ ] Real-time receipt streaming
- [ ] Cost estimation before execution
- [ ] Historical pattern learning

## Related Documentation

- `/gem-core/docs/EXECUTOR.md` - Layer 4 execution details
- `/gem-brain/docs/BRAIN.md` - Layer 3 orchestration
- `/gem-core/docs/REGISTRY.md` - Tool contract specification
- `/docs/CONSTRAINTS.md` - System constraints
- `/docs/STATE.md` - Implementation status

---

**Remember**: The operator exists to protect the system and enforce correctness, not to be flexible or impressive. When in doubt, refuse with clear reasoning.
