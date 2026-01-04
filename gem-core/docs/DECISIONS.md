# Architectural Decisions

This document captures irreversible or high-impact decisions that should not be re-litigated.

## D001: GEM is Cloud-First

**Date**: 2024
**Status**: Locked

GEM runs as a cloud-hosted background worker on Render. Local execution is not supported. The worker polls Supabase for queued tool calls and writes receipts back.

**Rationale**: Cloud hosting provides reliability, logging, and separation from local devices.

## D002: Registry is Authoritative

**Date**: 2024
**Status**: Locked

`tools.registry.json` is the single source of truth for tool definitions. Tool names, schemas, and idempotency rules are defined there and must not be modified without explicit versioning.

**Rationale**: Contract-first design enables reliable tool execution and agent orchestration.

## D003: Supabase is the Only Database

**Date**: 2024
**Status**: Locked

All data is stored in Supabase PostgreSQL. No secondary databases, no local storage, no file-based state.

**Rationale**: Single source of truth simplifies architecture and enables atomic operations.

## D004: Frontend and Backend are Separate Systems

**Date**: 2024
**Status**: Locked

The local Termux frontend (`frontend_bridge.py`) and the cloud backend (GEM/CKR-CORE) communicate only via Supabase tables. They share no code and have no direct connection.

**Rationale**: Clean separation allows independent evolution and deployment.

## D005: Exactly One Receipt Per Call

**Date**: 2024
**Status**: Locked

Every tool call in `core_tool_calls` produces exactly one corresponding receipt in `core_tool_receipts`. No exceptions, no batching, no deferred writes.

**Rationale**: Complete audit trail, deterministic execution, reliable retry semantics.

## D006: Three Outcome States Only

**Date**: 2024
**Status**: Locked

Every tool execution results in exactly one of:
- `succeeded` - Real execution with effects
- `failed` - Error with details
- `not_configured` - Tool exists but requires setup

**Rationale**: Unambiguous status enables reliable agent decision-making.

## D007: Keyed Idempotency Uses Registry Definition

**Date**: 2024
**Status**: Locked

For tools with `idempotency.mode: keyed`, the `key_field` is defined in the registry. The executor computes the key from `tool.name + key_field + input[key_field]` and checks for existing successful receipts.

**Rationale**: Prevents duplicate domain rows while allowing flexible key definitions.

## D008: Handler Dispatch Pattern

**Date**: 2024
**Status**: Locked

```
tool_name = "domain.method"
→ handler file: src/handlers/<domain>.js
→ exported function: <method>
```

For multi-part names, parts after domain are joined with underscore.

**Rationale**: Simple, predictable mapping from tool names to handler functions.

---

*This document captures decisions that should not be revisited without strong justification.*
