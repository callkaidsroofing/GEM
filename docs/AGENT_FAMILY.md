# GEM Agent Family

The GEM repository uses a **cooperative agent family** - specialized Claude Code agents with intentional biases that create productive tension. Each agent's "flaw" is actually their feature, and their interactions produce emergent quality.

## Core Philosophy

**Intentional Bias**: Each agent has a specific perspective that represents both a strength and a weakness. These biases aren't bugs - they're features that prevent groupthink and create comprehensive analysis.

**Complementary Pairs**: Agents are designed to check each other's blind spots:
- Paranoid ↔ Pragmatic (care vs. velocity)
- Architect ↔ Shipper (future vs. now)
- Contract ↔ User (correctness vs. usability)

**No Hallucination**: Agents reference actual files, real line numbers, specific code patterns. They are grounded in the GEM codebase.

**Emergent Quality**: The tension between agents creates better outcomes than any single perspective could achieve.

## The Family

### 1. gem-paranoid-validator
**Agent File**: `.claude/agents/gem-paranoid-validator.md`

**Bias**: Hyper-skeptical, assumes everything is broken

**Strengths**:
- Finds edge cases others miss
- Questions "obvious" assumptions
- Forces rigorous validation
- Catches race conditions
- Demands proof of correctness

**Weaknesses**:
- Can be overly pessimistic
- May request unnecessary edge case handling
- Slows velocity

**Invoke When**:
- After implementation, before declaring "done"
- When something "definitely works"
- Before production deployment
- After gem-pragmatic-shipper ships

**Complementary Agent**: gem-pragmatic-shipper

---

### 2. gem-pragmatic-shipper
**Agent File**: `.claude/agents/gem-pragmatic-shipper.md`

**Bias**: Ship fast, iterate later, "good enough" beats perfect

**Strengths**:
- Maintains velocity
- Avoids over-engineering
- Focuses on business value
- Unblocks progress
- Ships working code quickly

**Weaknesses**:
- May skip edge cases
- Writes TODO comments
- Can cut corners

**Invoke When**:
- Initial implementation
- Prototyping
- When stuck on edge cases
- Before gem-paranoid-validator validates

**Complementary Agent**: gem-paranoid-validator

---

### 3. gem-contract-enforcer
**Agent File**: `.claude/agents/gem-contract-enforcer.md`

**Bias**: Registry is law, schemas must be perfect

**Strengths**:
- Prevents contract drift
- Ensures determinism
- Enforces receipt doctrine
- Validates idempotency rules
- Maintains system integrity

**Weaknesses**:
- Can be inflexible
- Resists pragmatic shortcuts
- May block progress

**Invoke When**:
- Before modifying tools.registry.json
- Validating handler contracts
- Cross-module consistency checks
- Schema drift concerns

**Complementary Agent**: gem-user-advocate

---

### 4. gem-architect-visionary
**Agent File**: `.claude/agents/gem-architect-visionary.md`

**Bias**: Long-term thinking, patterns, "what if we scale 100x?"

**Strengths**:
- Prevents technical debt
- Designs for future needs
- Identifies patterns
- Unifies inconsistencies
- Thinks 5 steps ahead

**Weaknesses**:
- Can over-engineer
- Adds complexity prematurely
- Slows initial velocity

**Invoke When**:
- Planning new features
- Major refactoring
- System design
- Before architectural decisions

**Complementary Agent**: gem-pragmatic-shipper

---

### 5. gem-user-advocate
**Agent File**: `.claude/agents/gem-user-advocate.md`

**Bias**: DX over correctness, "is this confusing?"

**Strengths**:
- Makes systems intuitive
- Improves error messages
- Catches poor UX
- Adds documentation
- Reduces friction

**Weaknesses**:
- May prioritize convenience over correctness
- Can add verbosity
- Might question valid technical decisions

**Invoke When**:
- API design
- Error message review
- Documentation gaps
- When something technically works but feels wrong

**Complementary Agent**: gem-contract-enforcer

---

### 6. gem-performance-hawk
**Agent File**: `.claude/agents/gem-performance-hawk.md`

**Bias**: Optimize everything, "this query is O(n²)"

**Strengths**:
- Prevents performance issues
- Optimizes hot paths
- Identifies bottlenecks
- Adds indexes
- Thinks about scale

**Weaknesses**:
- Can optimize prematurely
- Adds complexity for marginal gains
- May sacrifice readability

**Invoke When**:
- Performance bottlenecks
- Query optimization
- Scale concerns
- Hot path analysis

**Complementary Agent**: gem-architect-visionary

## Complementary Relationships

```
gem-paranoid-validator ←→ gem-pragmatic-shipper
  (care vs velocity)

gem-architect-visionary ←→ gem-pragmatic-shipper
  (future vs now)

gem-contract-enforcer ←→ gem-user-advocate
  (correctness vs usability)

gem-architect-visionary ←→ gem-performance-hawk
  (design vs optimization)
```

## Example Workflows

### Workflow 1: Implementing a New Tool

```
1. gem-architect-visionary
   → Designs the approach
   → Considers patterns and future needs
   → Output: Architectural plan

2. gem-contract-enforcer
   → Validates registry definition
   → Ensures contract compliance
   → Output: Approved tool spec

3. gem-pragmatic-shipper
   → Implements basic handler quickly
   → Focuses on happy path
   → Output: Working implementation

4. gem-paranoid-validator
   → Finds edge cases and races
   → Demands proof of correctness
   → Output: List of gaps

5. gem-user-advocate
   → Improves error messages
   → Adds documentation
   → Output: Better DX

6. gem-performance-hawk (optional)
   → Optimizes if needed
   → Adds indexes
   → Output: Performance improvements
```

### Workflow 2: Fixing a Production Issue

```
1. gem-paranoid-validator
   → Identifies root cause
   → Questions assumptions
   → Output: What's actually broken

2. gem-pragmatic-shipper
   → Ships quick fix
   → Unblocks production
   → Output: Hotfix deployed

3. gem-architect-visionary
   → Designs proper solution
   → Prevents recurrence
   → Output: Long-term fix plan

4. gem-user-advocate
   → Improves error visibility
   → Updates docs
   → Output: Better debugging UX
```

### Workflow 3: Refactoring

```
1. gem-architect-visionary
   → Identifies pattern
   → Proposes abstraction
   → Output: Refactoring plan

2. gem-performance-hawk
   → Validates performance impact
   → Optimizes hot paths
   → Output: Performance analysis

3. gem-contract-enforcer
   → Ensures contracts unchanged
   → Validates behavior preservation
   → Output: Contract verification

4. gem-pragmatic-shipper
   → Implements refactoring
   → Keeps scope minimal
   → Output: Refactored code

5. gem-paranoid-validator
   → Tests edge cases still work
   → Validates no regressions
   → Output: Regression test results

6. gem-user-advocate
   → Updates documentation
   → Ensures clarity
   → Output: Updated docs
```

## How to Use the Agent Family

### Sequential Invocation

Use agents in sequence for comprehensive coverage:

```markdown
User: "I need to implement comms.send_sms"

1. First: gem-architect-visionary
   "How should we architect SMS sending for long-term?"
   → Get design approach

2. Then: gem-contract-enforcer
   "Validate the comms.send_sms contract"
   → Verify registry compliance

3. Then: gem-pragmatic-shipper
   "Implement the basic handler"
   → Get working code

4. Then: gem-paranoid-validator
   "Find issues with this implementation"
   → Identify gaps

5. Finally: gem-user-advocate
   "Review error messages and docs"
   → Polish UX
```

### Parallel Consultation

Get multiple perspectives simultaneously:

```markdown
User: "Should we add retry logic to all external API calls?"

Consult in parallel:
- gem-architect-visionary: Long-term design implications
- gem-pragmatic-shipper: Implementation complexity
- gem-performance-hawk: Performance impact
- gem-user-advocate: Error message changes needed

Then synthesize their perspectives.
```

### Conflict Resolution

When agents disagree, that's valuable:

```
gem-pragmatic-shipper: "Ship the basic version now"
gem-architect-visionary: "We need retry logic from day 1"

Resolution: Architect's insight + Shipper's velocity =
  Ship with basic retry (3 attempts, fixed backoff) now,
  Plan for smart retries (exponential, provider-specific) later
```

## Agent Invocation Patterns

### "Design → Build → Validate" Pattern

```
[Architect] Design
    ↓
[Shipper] Implement
    ↓
[Validator] Test
    ↓
[Advocate] Polish
```

### "Question → Answer → Verify" Pattern

```
[Validator] "What could go wrong?"
    ↓
[Shipper] "Here's a fix"
    ↓
[Contract Enforcer] "Does it follow contracts?"
```

### "Optimize → Validate → Document" Pattern

```
[Performance Hawk] "Here's the bottleneck"
    ↓
[Architect] "Here's the right abstraction"
    ↓
[Shipper] "Here's the implementation"
    ↓
[Advocate] "Here's the documentation"
```

## Avoiding Agent Misuse

### Don't Over-Invoke

❌ Bad: Invoke all 6 agents for a typo fix
✓ Good: Use gem-pragmatic-shipper for simple fixes

### Don't Ignore Conflict

❌ Bad: Architect says redesign, you ignore and ship
✓ Good: Synthesize: "Ship basic version with extensibility hooks"

### Don't Sequential-Only

❌ Bad: Always invoke in same order
✓ Good: Adapt order to situation (sometimes validate before design)

### Don't Expect Agreement

❌ Bad: Wait for all agents to agree
✓ Good: Use disagreement to understand trade-offs

## Monitoring Agent Effectiveness

Track which agents provide value:

```markdown
## Agent Impact Log

**Issue**: Duplicate leads being created
**Agents Consulted**:
- gem-paranoid-validator: Identified race condition
- gem-contract-enforcer: Verified keyed idempotency in registry
- gem-pragmatic-shipper: Implemented fix quickly
**Outcome**: Race condition fixed, no duplicates
**Lesson**: Validator caught issue Shipper would have missed

**Issue**: Slow query performance
**Agents Consulted**:
- gem-performance-hawk: Found missing index
- gem-architect-visionary: Confirmed index fits design
**Outcome**: 9x faster claims
**Lesson**: Hawk identified bottleneck, Architect validated approach

**Issue**: Confusing error messages
**Agents Consulted**:
- gem-user-advocate: Rewrote errors with context
**Outcome**: Support tickets decreased 40%
**Lesson**: Advocate caught UX issue others missed
```

## Meta-Patterns

### The Wisdom of Crowds

Multiple agents = multiple perspectives = better decisions

### Productive Tension

Disagreement reveals trade-offs and forces better thinking

### Specialized Expertise

Each agent is savant-level in their domain

### No Hallucination

Agents reference real files, actual code, specific lines

### Continuous Improvement

Agents learn repo patterns over time

## When NOT to Use Agents

- **Trivial changes**: Single-line fixes don't need architecture review
- **Pure research**: Exploring codebase doesn't need validation
- **User questions**: Answering "how does X work?" doesn't need design
- **Already decided**: Don't re-litigate architectural decisions (see /docs/DECISIONS.md)

## Success Metrics

The agent family is working when:

1. **Few surprises**: Edge cases caught before production
2. **Sustainable velocity**: Shipping fast WITHOUT creating debt
3. **High quality**: Few bugs, good performance, clear docs
4. **Low cognitive load**: Patterns are consistent, decisions are documented
5. **Happy developers**: Systems are intuitive, errors are helpful

## Related Documentation

- Individual agent specs: `.claude/agents/gem-*.md`
- System constraints: `/docs/CONSTRAINTS.md`
- Architectural decisions: `/docs/DECISIONS.md`
- Repository guide: `/CLAUDE.md`

## Skills: Agent Power Tools

The agent family is **amplified** (not replaced) by **Claude Skills** - deterministic, narrow, refusal-happy tools that agents invoke to execute known-safe workflows.

### Skills Philosophy

**Skills execute, agents decide.**

- Skills are deterministic, schema-bound, and opinionated
- Skills refuse if inputs are incomplete or ambiguous
- Skills never guess, never "do their best", never make judgments
- Skills strengthen agent biases without flattening them

### Available Skills

All Skills are documented in `.claude/skills/`:

#### Wave 1: Foundation

1. **handler-skeleton-generate** - Generate handler function skeletons
   - **Used by**: gem-pragmatic-shipper, gem-contract-enforcer
   - **Impact**: 90% reduction in boilerplate
   - **Strengthens**: Pragmatic ships 10x faster, Contract enforces patterns

2. **contract-drift-detect** - Compare handlers against registry contracts
   - **Used by**: gem-paranoid-validator, gem-contract-enforcer
   - **Impact**: Automated contract violation detection
   - **Strengthens**: Paranoid finds violations, Contract enforces automatically

3. **receipt-validate** - Verify receipts match doctrine exactly
   - **Used by**: gem-paranoid-validator, gem-contract-enforcer
   - **Impact**: Enforces "one receipt per call" rule
   - **Strengthens**: Paranoid validates claims, Contract prevents doctrine drift

#### Wave 2: Acceleration

4. **test-case-generate** - Generate SQL test inserts and verification queries
   - **Used by**: gem-pragmatic-shipper, gem-paranoid-validator
   - **Impact**: 90% reduction in test authoring time
   - **Strengthens**: Pragmatic ships tests faster, Paranoid tests more scenarios

5. **error-message-audit** - Audit error messages for clarity and actionability
   - **Used by**: gem-user-advocate, gem-paranoid-validator
   - **Impact**: Systematic UX improvement
   - **Strengthens**: User Advocate audits all handlers, Paranoid finds ambiguous errors

### Skills Invocation Matrix

| Skill | Paranoid | Pragmatic | Architect | User | Performance | Contract |
|-------|----------|-----------|-----------|------|-------------|----------|
| handler-skeleton-generate | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| contract-drift-detect | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| receipt-validate | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| test-case-generate | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| error-message-audit | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |

### Skills + Agents Workflow

Example: Implementing a new tool with Skills

```
1. gem-architect-visionary
   → Designs approach
   → Defines tool contract

2. gem-pragmatic-shipper
   → Invokes handler-skeleton-generate Skill
   → Gets handler template in 30 seconds
   → Implements business logic
   → Invokes test-case-generate Skill
   → Gets test SQL instantly

3. gem-contract-enforcer
   → Invokes contract-drift-detect Skill
   → Verifies no violations

4. gem-paranoid-validator
   → Invokes receipt-validate Skill
   → Verifies receipts match doctrine
   → Runs generated tests

5. gem-user-advocate
   → Invokes error-message-audit Skill
   → Improves error messages
```

**Result**: 80% time savings, 100% contract compliance, comprehensive testing

### Skills Governance

**New Skill Creation Criteria** (ALL must be true):
1. Deterministic (100% predictable)
2. Narrow (single responsibility)
3. Non-judgmental (requires zero interpretation)
4. Schema-bound (strict input/output schemas)
5. Refusal-happy (clear refusal conditions)
6. Bias-preserving (strengthens agents without flattening)
7. Quality-bar (passes all 5 agent checks)

**Skills Retirement**: A Skill MUST be retired if:
- Superseded by native tooling
- Drift from GEM patterns
- Unused for 30 days
- Refusal rate > 50%
- Violates GEM hard laws

### Skills vs Agents

| Aspect | Agents | Skills |
|--------|--------|--------|
| Purpose | Decide what to do | Execute known workflows |
| Judgment | Make judgments | Never guess |
| Bias | Intentional bias | No bias, deterministic |
| Output | Analysis, recommendations | Structured artifacts |
| Failure Mode | Disagree productively | Refuse clearly |

**Key Principle**: Skills make agents more effective without making them less distinctive.

## Contributing to the Family

New agents should:
1. Have a clear intentional bias
2. Complement (not duplicate) existing agents
3. Reference actual GEM files and patterns
4. Produce actionable output
5. Be invokable with specific prompts

Proposed agents are reviewed for:
- **Necessary**: Fills a gap in current family
- **Biased**: Has a clear, intentional perspective
- **Complementary**: Creates productive tension with existing agents
- **Grounded**: References real code, not abstract concepts

New Skills should:
1. Meet all 7 creation criteria (see Skills Governance)
2. Strengthen at least one agent bias
3. Not flatten any agent bias
4. Pass the 5-agent quality bar

---

*The agent family represents a room full of extraordinary savants who complement each other through different perspectives, amplified by deterministic Skills that eliminate toil without eliminating judgment, creating emergent quality without drift or hallucination.*
