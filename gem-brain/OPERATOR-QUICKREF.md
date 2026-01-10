# CKR-GEM Operator Quick Reference

## One-Liner
System intelligence that transforms natural language → schema-valid execution via 4 non-collapsible layers.

## Quick Start
```bash
# Install (no new dependencies needed)
cd gem-brain

# Basic usage
node scripts/operator-cli.js "system status"

# Interactive mode
node scripts/operator-cli.js --interactive

# With approval
node scripts/operator-cli.js -m "finalize quote abc" -M execute --approve
```

## 4 Layers (Never Collapse)

| Layer | Name | Responsibility | Output |
|-------|------|----------------|--------|
| **1** | Judgement | Intent classification, risk assessment | IntentClassification |
| **2** | Skills | Schema-valid Run Plan generation | RunPlan |
| **3** | Brain | Tool call orchestration (existing brain.js) | Enqueued calls |
| **4** | Worker | Execution (existing gem-core) | Receipts |

## Risk Tiers

| Tier | Approval? | Examples |
|------|-----------|----------|
| **T0** | No | `os.health_check`, `leads.list_by_stage` |
| **T1** | No | `os.create_task`, `leads.create` |
| **T2** | **YES** | `quote.finalize`, `inspection.submit` |
| **T3** | **YES** | `sms.send`, `email.send_quote` |
| **T4** | **YES** | `invoice.void`, `job.cancel` |

## Execution Modes

| Mode | Layers | Returns | Use When |
|------|--------|---------|----------|
| `analyze` | 1-2 | Intent + Plan | Just want to see what would happen |
| `plan` | 1-2 | Full plan + SQL | Need approval or verification |
| `enqueue` | 1-3 | Call IDs | Fire and forget |
| `enqueue_and_wait` | 1-4 | Receipts | Need immediate results |
| `execute` | 1-4 | Receipts | Full execution (auto-approves T1) |

## Operational Domains
`lead` `inspection` `quote` `task` `note` `job` `invoice` `comms` `devops` `system`

## Output Structure (Always)
```
[INTENT]          - Classification details
[PLAN or RESULT]  - Execution plan or results
[TOOL IMPACT]     - Tools involved
[RISKS / GATES]   - Risk tier and approval
[NEXT ACTIONS]    - What to do next
```

## CLI Commands

```bash
# Simple analysis
node scripts/operator-cli.js "create task: call John"

# With mode
node scripts/operator-cli.js -m "new lead: Sarah 0400123456" -M plan

# With context
node scripts/operator-cli.js -m "show inspection" --inspection-id abc123

# Interactive
node scripts/operator-cli.js -i
```

## Interactive Mode Commands
```
:mode <analyze|plan|enqueue|execute>  - Set execution mode
:approve                               - Toggle approval flag
:context <key> <value>                 - Set context
:clear                                 - Clear context and approval
:quit                                  - Exit
```

## Programmatic API

```javascript
import { createOperator } from './src/operator/orchestrator.js';

const operator = createOperator();

// Analyze only
const result = await operator.process({
  message: 'system status',
  mode: 'analyze'
});

// Execute with approval
const result = await operator.process({
  message: 'finalize quote abc',
  mode: 'execute',
  explicit_approval: true,
  context: { quote_id: 'abc' }
});

// Batch
const results = await operator.batch({
  messages: ['task 1', 'task 2', 'task 3'],
  mode: 'analyze'
});
```

## Quality Gate Checks
- ✓ Schema correct
- ✓ Provable by receipt
- ✓ Worker safe
- ✓ Approval obtained (if required)
- ⚠ Safer alternative suggested (if applicable)

## Prime Directives (Order Matters)
1. Safety & legal
2. Contract correctness (registry is LAW)
3. Operational continuity
4. Revenue flow
5. Brand integrity
6. User intent

## Environment

```bash
OPENROUTER_API_KEY=required       # For Layer 1 classification
OPENROUTER_MODEL=optional         # Default: anthropic/claude-3.5-sonnet
SUPABASE_URL=required             # For Layer 3-4
SUPABASE_SERVICE_ROLE_KEY=required
```

## NPM Scripts

```bash
npm run operator              # CLI
npm run operator:interactive  # Interactive mode
npm run operator:examples     # Run examples
npm run verify               # Syntax check
```

## Files

```
gem-brain/
├── src/operator/
│   ├── operator.js          # Core 4-layer implementation
│   ├── orchestrator.js      # Main coordinator
│   └── README.md            # Module docs
├── scripts/
│   └── operator-cli.js      # CLI interface
├── examples/
│   └── operator-examples.js # Demonstrations
├── tests/
│   └── operator-demo.js     # Live tests
└── docs/
    └── OPERATOR.md          # Full specification
```

## Common Patterns

### Check system status
```bash
node scripts/operator-cli.js "system status"
```

### Create task
```bash
node scripts/operator-cli.js "create task: follow up with John"
```

### Create lead
```bash
node scripts/operator-cli.js "new lead: Sarah 0400123456 in Clayton"
```

### With approval required
```bash
node scripts/operator-cli.js -m "finalize quote abc" -M execute --approve
```

### Inspection workflow
```bash
node scripts/operator-cli.js \
  -m "create inspection for lead" \
  --lead-id abc123 \
  -M plan
```

## Assertions & Refusals

The operator WILL REFUSE if:
- ❌ Directive conflict detected
- ❌ Tool not in registry
- ❌ Schema validation fails
- ❌ Missing required evidence
- ❌ Quality gate fails
- ❌ T2+ operation without approval

The operator WILL CLARIFY if:
- ❓ Intent ambiguous
- ❓ Multiple interpretations possible
- ❓ Missing critical context

## Error Handling

```javascript
try {
  const result = await operator.process({ message, mode });
  if (result.intent_summary.includes('refuse')) {
    console.log('Refused:', result.plan_summary);
  }
} catch (error) {
  console.error('Operator error:', error.message);
}
```

## Decision Tree

```
Input → Classify Intent
          ├─ refuse → Return reason
          ├─ clarify → Ask question
          └─ execute → Generate Plan
                         ├─ Quality Gate
                         │    ├─ FAIL → Refuse
                         │    └─ PASS → Check approval
                         └─ Approval required?
                              ├─ Yes & not provided → Halt
                              └─ No or provided → Execute
```

## Integration Points

- **Existing Brain**: Delegates Layer 3 orchestration to `brain.js`
- **Registry**: All validation against `tools.registry.json`
- **Worker**: Execution via gem-core handlers
- **Supabase**: Evidence, enqueueing, receipts

## Documentation

- Quick: `OPERATOR-QUICKREF.md` (this file)
- Summary: `OPERATOR-SUMMARY.md`
- Full: `docs/OPERATOR.md`
- Module: `src/operator/README.md`

## Remember

**Decisions are cheap. Execution is sacred. Receipts are truth.**

When in doubt: refuse with clear reasoning.
