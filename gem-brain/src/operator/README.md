# CKR-GEM Operator Module

System intelligence layer implementing the 4-layer execution model for Call Kaids Roofing GEM platform.

## Quick Start

```javascript
import { createOperator } from './orchestrator.js';

const operator = createOperator({
  openrouter_api_key: process.env.OPENROUTER_API_KEY
});

// Analyze intent
const result = await operator.process({
  message: 'create task: call John',
  mode: 'analyze'
});

console.log(result.intent_summary);
console.log(result.plan_summary);
```

## Files

- **operator.js** - Core 4-layer implementation (Judgement, Skills, Quality Gate)
- **orchestrator.js** - Main orchestrator that coordinates all layers
- **README.md** - This file

## Usage Modes

### Analyze (Layer 1-2 only)
```javascript
const result = await operator.process({
  message: 'new lead: Sarah in Clayton',
  mode: 'analyze'
});
// Returns: Intent classification + Run Plan
```

### Plan (Layer 1-2 + Verification)
```javascript
const result = await operator.process({
  message: 'finalize quote abc123',
  mode: 'plan'
});
// Returns: Full execution plan with SQL verification
```

### Execute (All 4 layers)
```javascript
const result = await operator.process({
  message: 'create inspection for lead xyz',
  mode: 'execute',
  explicit_approval: true,
  context: { lead_id: 'xyz' }
});
// Returns: Execution receipts + results
```

### Interactive
```javascript
const result = await operator.interactive({
  message: 'system status',
  context: {}
});
// Presents structured output and approval flow
```

## Classes

### JudgementLayer
Layer 1 - Intent classification, risk assessment, directive checking

### DecisionArtifactGenerator
Layer 2 - Schema-valid Run Plan generation

### StructuredOutputFormatter
Enforces mandatory output contract

### QualityGate
Pre-execution validation checklist

### OperatorOrchestrator
Coordinates all layers without collapsing them

## Risk Tiers

- **T0**: Read/Analysis (no approval)
- **T1**: Local artifacts (allowed)
- **T2**: Schema changes (approval required)
- **T3**: External comms (approval required)
- **T4**: Irreversible ops (approval required)

## Output Structure

Every response follows this contract:

```
[INTENT]
<Classification details>

[PLAN or RESULT]
<Execution plan or results>

[TOOL IMPACT]
<Tools involved>

[RISKS / GATES]
<Risk tier and approval status>

[NEXT ACTIONS]
<Actionable steps>
```

## Environment

```bash
OPENROUTER_API_KEY=required_for_layer1
SUPABASE_URL=required_for_layer3_4
SUPABASE_SERVICE_ROLE_KEY=required_for_layer3_4
```

## CLI

```bash
# Direct usage
node ../../scripts/operator-cli.js "system status"

# Interactive mode
node ../../scripts/operator-cli.js --interactive

# With approval
node ../../scripts/operator-cli.js -m "finalize quote abc" -M execute --approve
```

## Examples

See `../../examples/operator-examples.js` for comprehensive demonstrations.

## Documentation

See `../../docs/OPERATOR.md` for full specification.

## Design Principles

1. Never collapse layers
2. Decisions are cheap, execution is sacred
3. Receipts are truth
4. Protect the system, not impress the user
5. When in doubt, refuse

---

**Remember**: This operator is not an agent. It's a system intelligence with strict boundaries and non-negotiable directives.
