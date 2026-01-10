# GEM High Council Operator v2.0 Architecture

## Overview

This document describes the unified architecture synthesizing:
1. **GEM's registry-driven tool execution** (contract-first, receipt-proven)
2. **High Council's multi-persona deliberation** (built-in checks and balances)
3. **Claude agents' specialized expertise** (skill packs, validation, shipping)
4. **Durable memory across sessions** (ledger + conversation history)
5. **RAG-first knowledge grounding** (evidence-based decisions)

**Generated:** 2026-01-11
**Based on:** CKR-GEM-V5 High Council Builder + GEM Operator v1.0

---

## Gap Analysis Summary

### Already Present in GEM:
- 4-Layer Execution Model (Judgement, Skills, Brain, Worker)
- Risk Tiers (T0-T4) with approval gating
- Memory persistence (file-based)
- RAG retrieval (Supabase-based)
- Interactive CLI with REPL
- Prime directives (6 in order)
- Structured output format
- Quality gate checks
- Multi-agent architecture (6 Claude agents)

### Gaps to Fill (from High Council):
| Feature | Priority | Status |
|---------|----------|--------|
| Ledger System (FACTS, DECISIONS, OPEN_LOOPS, RUN_LOG) | HIGH | Planned |
| Context Retention Patch (auto-inject 50 turns) | HIGH | Planned |
| 3-Pass RAG Retrieval | HIGH | Planned |
| RAG Citation Format [RAG:path#ref] | MEDIUM | Planned |
| Canonical Services Locking | MEDIUM | Planned |
| V21 Action ID (YYYYMMDD-HHMM-TYPE-slug) | MEDIUM | Planned |
| Multi-Persona Council Deliberation | MEDIUM | Planned |
| Quiet Hours Management | LOW | Planned |
| Notification Classification Pipeline | LOW | Planned |

---

## Architecture Diagram

```
                    NATURAL LANGUAGE INPUT
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 0: CONTEXT HYDRATION (NEW)                                   │
│  • Load ledger files (FACTS, DECISIONS, OPEN_LOOPS, RUN_LOG)        │
│  • Inject conversation history (last 50 turns from JSONL)           │
│  • Build RAG context (3-pass: Intent → Brand → SOP)                 │
│  Output: HydratedContext                                            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 1: COUNCIL JUDGEMENT (ENHANCED)                              │
│  • Parse intent with full hydrated context                          │
│  • Optional council deliberation for T2+ operations                 │
│  • Check RAG evidence ("No CKR source found" if empty)              │
│  • Generate V21 action ID                                           │
│  Output: IntentClassification + CouncilDeliberation + ActionID      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 2: SKILLS (Deterministic - unchanged)                        │
│  • Generate schema-valid Run Plan                                   │
│  • Validate against tools.registry.json                             │
│  Output: RunPlan                                                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                     [QUALITY GATE CHECK]
                     [APPROVAL GATE CHECK]
                     [QUIET HOURS CHECK] (NEW)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 3: BRAIN (Orchestration - delegates to brain.js)             │
│  Output: Enqueued tool calls                                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 4: WORKER (Execution - gem-core)                             │
│  Output: Receipts                                                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 5: LEDGER UPDATE (NEW)                                       │
│  • Append to conversation history (JSONL)                           │
│  • Update RUN_LOG.md, OPEN_LOOPS.md, DECISIONS.md                   │
│  Output: Persisted state                                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
gem-brain/
├── .ledger/                           # NEW: Durable memory ledger
│   ├── FACTS.json                     # System facts and configuration
│   ├── DECISIONS.md                   # Decision log with timestamps
│   ├── OPEN_LOOPS.md                  # Outstanding tasks/questions
│   ├── RUN_LOG.md                     # Execution history
│   └── session_id.txt                 # Current session identifier
├── .memory/                           # EXISTING: Session memory
├── .config/                           # EXISTING: Operator config
├── src/
│   ├── operator/
│   │   ├── operator.js               # EXISTING (enhanced)
│   │   ├── orchestrator.js           # EXISTING (add Layer 0/5)
│   │   ├── memory.js                 # EXISTING
│   │   ├── config.js                 # EXISTING
│   │   ├── rag.js                    # EXISTING
│   │   ├── rag-enhanced.js           # NEW: 3-pass retrieval
│   │   ├── ledger.js                 # NEW: Ledger system
│   │   ├── council.js                # NEW: Multi-persona deliberation
│   │   ├── action-id.js              # NEW: V21 action ID
│   │   ├── canonical-services.js     # NEW: Service locking
│   │   ├── notification.js           # NEW: Notification classifier
│   │   └── quiet-hours.js            # NEW: Time-based control
│   └── llm/
│       ├── openrouter.js             # EXISTING
│       ├── intent_parser.js          # EXISTING
│       └── context-injection.js      # NEW: Auto-inject history
└── docs/
    └── OPERATOR-V2-ARCHITECTURE.md   # THIS FILE
```

---

## New Components

### 1. Ledger System (ledger.js)

```javascript
class OperatorLedger {
  constructor(ledgerDir = '.ledger') { }

  // Core operations
  loadFacts() { }
  appendDecision(decision, reasoning) { }
  addOpenLoop(description, priority) { }
  closeOpenLoop(id, resolution) { }
  logRun(summary) { }

  // Context building
  buildContextPacket() { }  // For LLM injection
}
```

**FACTS.json Structure:**
```json
{
  "mode": "GEM-OPERATOR",
  "repo_root": "/data/data/com.termux/files/home/GEM",
  "termux_safe": true,
  "network_default": "on",
  "db_default": "supabase",
  "secrets_policy": "redact_never_print_tokens",
  "brand": {
    "company": "Call Kaids Roofing",
    "abn": "39475055075",
    "phone": "0435 900 709"
  }
}
```

### 2. Enhanced RAG (rag-enhanced.js)

```javascript
class EnhancedRAG extends OperatorRAG {
  // 3-pass retrieval
  async threePassRetrieval(message, context) {
    const pass1 = await this.queryIntent(message);     // Intent + object
    const pass2 = await this.queryBrand(context);      // Brand + constraints
    const pass3 = await this.querySOPs(message);       // SOPs + templates
    return this.mergeResults(pass1, pass2, pass3);
  }

  // Citation format
  buildCitationBlock(results) {
    // Returns [RAG:<path>#ref] format
  }

  // Canonical services
  checkCanonicalServices(query) {
    // Returns locked list or "No CKR source found"
  }
}
```

### 3. V21 Action ID (action-id.js)

```javascript
// Format: YYYYMMDD-HHMM-TYPE-slug
// Example: 20260111-1430-SMS-ack_missedcall

function generateV21ActionId(actionType, slug) {
  const now = new Date();
  const date = now.toISOString().slice(0,10).replace(/-/g,'');
  const time = now.toTimeString().slice(0,5).replace(':','');
  const type = actionType.toUpperCase();
  const clean = slug.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${date}-${time}-${type}-${clean}`;
}

function validateV21ActionId(actionId) {
  return /^\d{8}-\d{4}-[A-Z]+-[a-z0-9_]+$/.test(actionId);
}
```

### 4. Council Deliberation (council.js)

```javascript
const PERSONAS = {
  ARCHITECT: { bias: 'Single source of truth', safeguard: 'Reject messy fixes' },
  CRITIC: { bias: 'Paranoid, safety-obsessed', safeguard: 'Never delete without backup' },
  PLANNER: { bias: 'Systematic ordering', safeguard: 'Never skip dependencies' },
  ENGINEER: { bias: 'Working code first', safeguard: 'Contract compliance' },
  INSPECTOR: { bias: 'Skeptical of claims', safeguard: 'Require proof' },
  REFINER: { bias: 'User experience', safeguard: 'Clear communication' },
  SHIPPER: { bias: 'Ship fast', safeguard: 'Monitor for issues' }
};

class CouncilDeliberation {
  async deliberate(intent, context) {
    // For T0/T1: Fast-path, skip council
    // For T2+: Full deliberation
    return { consensus, blockers, warnings, personaVotes };
  }
}
```

### 5. Canonical Services (canonical-services.js)

```javascript
const CANONICAL_SERVICES = [
  'Roof restorations (tile + metal)',
  'Roof painting',
  'High-pressure washing (roof)',
  'Ridge capping rebedding/repointing (incl. gables)',
  'Valley iron replacement',
  'Gutter cleaning',
  'Leak detection',
  'Broken tile replacement',
  'Re-roofing + new roofs'
];

function validateServiceQuery(query) {
  // Match against canonical list
  // Return { valid, service, fallback: "No CKR source found" }
}
```

### 6. Quiet Hours (quiet-hours.js)

```javascript
const QUIET_HOURS = {
  start: '22:00',
  end: '07:00',
  timezone: 'Australia/Melbourne'
};

function isQuietHours() { }
function canOverride(reason) { }  // Emergency only
function getQueuedUntil() { }     // Returns next active time
```

---

## Implementation Phases

### Phase 1: Foundation (HIGH PRIORITY) - COMPLETED
- [x] Create ledger.js with FACTS, DECISIONS, OPEN_LOOPS, RUN_LOG
- [x] Create .ledger/ directory structure
- [x] Create context-injection.js for auto-inject history
- [x] Update orchestrator.js with Layer 0 and Layer 5

### Phase 2: Enhanced RAG (HIGH PRIORITY) - COMPLETED
- [x] Create rag-enhanced.js with 3-pass retrieval
- [x] Create canonical-services.js
- [x] Update citation format in outputs

### Phase 3: V21 Action ID + Quiet Hours (MEDIUM PRIORITY) - COMPLETED
- [x] Create action-id.js
- [x] Create quiet-hours.js
- [x] Integrate into orchestrator.js

### Phase 4: Council Deliberation (MEDIUM PRIORITY) - COMPLETED
- [x] Create council.js
- [x] Add enable_council config flag
- [x] Integrate for T2+ operations

### Phase 5: Notification Pipeline (LOW PRIORITY) - COMPLETED
- [x] Create notification.js classifier
- [ ] Create Termux integration script (Future)
- [ ] Update gemo with notification mode (Future)

---

## Configuration

### Environment Variables
```bash
export GEM_ENABLE_LEDGER=true
export GEM_ENABLE_CITATIONS=true
export GEM_ENABLE_3PASS_RAG=true
export GEM_ENABLE_V21_ACTION_ID=true
export GEM_ENABLE_QUIET_HOURS=true
export GEM_ENABLE_COUNCIL=false  # Opt-in
export GEM_MAX_TURNS=50
export GEM_TIMEZONE="Australia/Melbourne"
export GEM_QUIET_HOURS_START="22:00"
export GEM_QUIET_HOURS_END="07:00"
```

### Feature Flags (config.js)
```javascript
behavior: {
  enable_ledger: true,
  enable_citations: true,
  enable_3pass_rag: true,
  enable_v21_action_id: true,
  enable_quiet_hours: true,
  enable_council: false,
  enable_notifications: false
}
```

---

## Success Criteria

- [x] Ledger files persist across sessions
- [x] Conversation history auto-injected (last 50 turns)
- [x] RAG citations in [RAG:path#ref] format
- [x] Service queries return canonical list
- [x] Action IDs in V21 format
- [x] Quiet hours block external comms
- [x] Council deliberation for T2+ (when enabled)

---

## Related Documentation

- `/gem-core/docs/EXECUTOR.md` - Layer 4 execution
- `/gem-brain/docs/BRAIN.md` - Layer 3 orchestration
- `/gem-brain/docs/OPERATOR.md` - Operator v1.0 spec
- `/docs/CONSTRAINTS.md` - System constraints
- `.claude/agents/*.md` - Claude agent specifications
