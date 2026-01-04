# Architectural Decisions

Locked decisions. Do not re-litigate without strong justification.

## D001: Cloud-First

GEM runs on Render. No local execution mode.

## D002: Registry is Authoritative

`tools.registry.json` defines all tools. Names, schemas, idempotency are contracts.

## D003: Supabase Only

Single database. No secondary storage, no local state.

## D004: Queue-Based Communication

Brain and Executor communicate via `core_tool_calls` and `core_tool_receipts` tables only. No direct calls.

## D005: One Receipt Per Call

Every call produces exactly one receipt. No batching, no deferred writes.

## D006: Three States Only

Tool outcomes: `succeeded`, `failed`, `not_configured`. No other states.

## D007: Keyed Idempotency via Registry

`idempotency.mode: keyed` uses `key_field` from registry. Executor checks for duplicates.

## D008: Handler Dispatch Pattern

```
domain.method → src/handlers/<domain>.js → export <method>
```

## D009: Brain Validates, Executor Executes

Brain validates input against registry before enqueueing. Executor trusts Brain did its job but re-validates.

## D010: Rules-First Brain

Brain works without LLM. Pattern matching handles common cases. LLM is optional enhancement.

## D011: Documentation at Root

`/docs/` is canonical. Subsystem docs are local mechanics only.

---

*Decisions are permanent unless explicitly revisited.*
