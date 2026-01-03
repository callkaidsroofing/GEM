# Registry Coverage Report

Generated from `tools.registry.json` v1.0.0

> **This file is generated from `tools.registry.json` and handler exports.**
> **Do not edit by hand.**
>
> Regenerate with: `node scripts/analyze-coverage.js`
> Review handler files in `src/handlers/` to determine real vs not_configured status.

## Coverage Summary

| Status | Count |
|--------|-------|
| Real Implementation | 40 |
| Not Configured | 59 |
| **Total** | **99** |

**Coverage: 100%** - All tools have executable handlers.

---

## Tools by Domain

### os (13 tools)

| Tool | Status | Idempotency | Tables Touched |
|------|--------|-------------|----------------|
| os.health_check | real | safe-retry | core_tool_calls |
| os.get_state_snapshot | real | safe-retry | - |
| os.refresh_state_snapshot | real | safe-retry | - |
| os.create_note | real | none | notes |
| os.search_notes | real | safe-retry | notes |
| os.create_task | real | none | tasks |
| os.update_task | real | safe-retry | tasks |
| os.complete_task | real | safe-retry | tasks |
| os.defer_task | real | safe-retry | tasks |
| os.list_tasks | real | safe-retry | tasks |
| os.create_reminder | real | none | tasks |
| os.audit_log_search | real | safe-retry | core_tool_receipts |
| os.rollback_last_action | real | safe-retry | - |

### identity (7 tools)

| Tool | Status | Idempotency | Tables Touched |
|------|--------|-------------|----------------|
| identity.get_self_model | not_configured | safe-retry | - |
| identity.update_self_model | not_configured | safe-retry | - |
| identity.add_memory | not_configured | keyed (key) | - |
| identity.expire_memory | not_configured | safe-retry | - |
| identity.list_memories | not_configured | safe-retry | - |
| identity.score_pattern | not_configured | keyed (key) | - |
| identity.set_boundaries | not_configured | safe-retry | - |

### entity (7 tools)

| Tool | Status | Idempotency | Tables Touched |
|------|--------|-------------|----------------|
| entity.create | real | none | entities |
| entity.update | real | safe-retry | entities |
| entity.search | real | safe-retry | entities |
| entity.get | real | safe-retry | entities |
| entity.link_to_conversation | not_configured | safe-retry | - |
| entity.add_interaction | not_configured | none | - |
| entity.add_address_site_details | not_configured | safe-retry | - |

### leads (7 tools)

| Tool | Status | Idempotency | Tables Touched |
|------|--------|-------------|----------------|
| leads.create | real | keyed (phone) | leads |
| leads.update_stage | real | safe-retry | leads |
| leads.add_source | real | safe-retry | leads |
| leads.add_photos_link | real | none | leads |
| leads.schedule_inspection | real | none | leads |
| leads.list_by_stage | real | safe-retry | leads |
| leads.mark_lost | real | safe-retry | leads |

### inspection (7 tools)

| Tool | Status | Idempotency | Tables Touched |
|------|--------|-------------|----------------|
| inspection.create | not_configured | none | - |
| inspection.add_checklist_item | not_configured | none | - |
| inspection.add_measurement | not_configured | none | - |
| inspection.add_photo_ref | not_configured | none | - |
| inspection.add_defect | not_configured | none | - |
| inspection.generate_scope_summary | not_configured | safe-retry | - |
| inspection.lock | not_configured | safe-retry | - |

### quote (7 tools)

| Tool | Status | Idempotency | Tables Touched |
|------|--------|-------------|----------------|
| quote.create_from_inspection | real | none | quotes |
| quote.update_line_items | real | safe-retry | quote_line_items |
| quote.calculate_totals | real | safe-retry | quotes, quote_line_items |
| quote.generate_pdf | real | safe-retry | - |
| quote.send_to_client | real | safe-retry | quotes |
| quote.mark_accepted | real | safe-retry | quotes |
| quote.mark_declined | real | safe-retry | quotes |

### job (9 tools)

| Tool | Status | Idempotency | Tables Touched |
|------|--------|-------------|----------------|
| job.create_from_accepted_quote | real | none | jobs |
| job.assign_dates | real | safe-retry | jobs |
| job.create_job_card | not_configured | safe-retry | - |
| job.add_site_notes | real | none | jobs |
| job.add_progress_update | not_configured | none | - |
| job.add_before_after_refs | not_configured | none | - |
| job.complete | real | safe-retry | jobs |
| job.generate_warranty_certificate | not_configured | safe-retry | - |
| job.request_review | not_configured | safe-retry | - |

### invoice (6 tools)

| Tool | Status | Idempotency | Tables Touched |
|------|--------|-------------|----------------|
| invoice.create_from_job | real | none | invoices |
| invoice.send | not_configured | safe-retry | - |
| invoice.add_payment | real | none | invoices |
| invoice.mark_overdue | real | safe-retry | invoices |
| invoice.send_reminder_sms | not_configured | safe-retry | - |
| invoice.send_reminder_email | not_configured | safe-retry | - |

### finance (2 tools)

| Tool | Status | Idempotency | Tables Touched |
|------|--------|-------------|----------------|
| finance.generate_cashflow_snapshot | not_configured | safe-retry | - |
| finance.generate_pnl_snapshot | not_configured | safe-retry | - |

### comms (6 tools)

| Tool | Status | Idempotency | Tables Touched |
|------|--------|-------------|----------------|
| comms.compose_sms | not_configured | safe-retry | - |
| comms.send_sms | not_configured | safe-retry | - |
| comms.compose_email | not_configured | safe-retry | - |
| comms.send_email | not_configured | safe-retry | - |
| comms.log_call_outcome | real | none | comms_log |
| comms.create_followup_task_from_message | real | none | tasks |

### calendar (5 tools)

| Tool | Status | Idempotency | Tables Touched |
|------|--------|-------------|----------------|
| calendar.find_slots | not_configured | safe-retry | - |
| calendar.create_event | not_configured | none | - |
| calendar.update_event | not_configured | safe-retry | - |
| calendar.cancel_event | not_configured | safe-retry | - |
| calendar.attach_job_to_event | not_configured | safe-retry | - |

### media (6 tools)

| Tool | Status | Idempotency | Tables Touched |
|------|--------|-------------|----------------|
| media.register_asset | not_configured | keyed (file_ref) | - |
| media.tag_asset | not_configured | safe-retry | - |
| media.generate_alt_text | not_configured | safe-retry | - |
| media.generate_caption | not_configured | safe-retry | - |
| media.propose_rename_map | not_configured | safe-retry | - |
| media.export_website_pack | not_configured | safe-retry | - |

### marketing (6 tools)

| Tool | Status | Idempotency | Tables Touched |
|------|--------|-------------|----------------|
| marketing.generate_meta_ad_pack | not_configured | safe-retry | - |
| marketing.generate_google_ads_pack | not_configured | safe-retry | - |
| marketing.generate_case_study_from_job | not_configured | safe-retry | - |
| marketing.generate_gmb_post | not_configured | safe-retry | - |
| marketing.schedule_content | not_configured | none | - |
| marketing.log_campaign_result | not_configured | none | - |

### personal (5 tools)

| Tool | Status | Idempotency | Tables Touched |
|------|--------|-------------|----------------|
| personal.check_in | not_configured | none | - |
| personal.create_commitment | not_configured | none | - |
| personal.review_commitments | not_configured | safe-retry | - |
| personal.decision_support | not_configured | safe-retry | - |
| personal.boundary_set | not_configured | keyed (key) | - |

### integrations (6 tools)

| Tool | Status | Idempotency | Tables Touched |
|------|--------|-------------|----------------|
| integrations.google_drive.search | not_configured | safe-retry | - |
| integrations.google_photos.import_links | not_configured | none | - |
| integrations.analytics.pull_summary | not_configured | safe-retry | - |
| integrations.ads.pull_summary | not_configured | safe-retry | - |
| integrations.sms_provider.health | not_configured | safe-retry | - |
| integrations.email_provider.health | not_configured | safe-retry | - |

---

## Not Configured Tools - Required Providers

### Requires SMS Provider (Twilio)
- comms.send_sms
- invoice.send
- invoice.send_reminder_sms
- job.request_review
- integrations.sms_provider.health

### Requires Email Provider (SendGrid)
- comms.send_email
- invoice.send
- invoice.send_reminder_email
- job.request_review
- integrations.email_provider.health

### Requires Google Calendar API
- calendar.find_slots
- calendar.create_event
- calendar.update_event
- calendar.cancel_event
- calendar.attach_job_to_event

### Requires Google Drive API
- integrations.google_drive.search

### Requires Analytics API
- integrations.analytics.pull_summary

### Requires Ads API
- integrations.ads.pull_summary

### Requires AI Composition Service
- comms.compose_sms
- comms.compose_email
- marketing.generate_meta_ad_pack
- marketing.generate_google_ads_pack
- marketing.generate_case_study_from_job
- marketing.generate_gmb_post
- personal.decision_support

### Requires Additional Tables
- identity.* - memory_primitives, identity_model tables
- inspection.* - inspections, inspection_items tables
- media.* - media_assets table
- personal.check_in - checkins table
- personal.create_commitment - commitments table

---

## Keyed Idempotency Tools

| Tool | Key Field |
|------|-----------|
| leads.create | phone |
| media.register_asset | file_ref |
| identity.add_memory | key |
| identity.score_pattern | key |
| personal.boundary_set | key |

---

*This report is generated from the registry and reflects current implementation status.*
*Last updated: 2026-01-03*
