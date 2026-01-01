# Registry Coverage Audit

**Version**: 1.0.0
**Generated**: Phase 1B
**Total Tools**: 91
**Real Implementations**: 45
**Not Configured**: 46

## Coverage Summary

| Domain | Total | Real | Not Configured |
|--------|-------|------|----------------|
| os | 13 | 13 | 0 |
| identity | 7 | 0 | 7 |
| entity | 7 | 7 | 0 |
| leads | 7 | 7 | 0 |
| inspection | 7 | 0 | 7 |
| quote | 8 | 8 | 0 |
| job | 10 | 7 | 3 |
| invoice | 6 | 4 | 2 |
| finance | 2 | 2 | 0 |
| comms | 6 | 3 | 3 |
| calendar | 5 | 0 | 5 |
| media | 6 | 0 | 6 |
| marketing | 6 | 2 | 4 |
| personal | 5 | 3 | 2 |
| integrations | 6 | 0 | 6 |

---

## Detailed Coverage

### os.* (Operating System Tools)

| tool_name | handler_file | status | db_tables_touched | notes |
|-----------|--------------|--------|-------------------|-------|
| os.health_check | os.js | real | core_tool_calls | DB connectivity check |
| os.get_state_snapshot | os.js | real | - | Returns placeholder state |
| os.refresh_state_snapshot | os.js | real | - | Generates snapshot_id |
| os.create_note | os.js | real | notes | Full DB insert |
| os.search_notes | os.js | real | notes | Full text search |
| os.create_task | os.js | real | tasks | Full DB insert |
| os.update_task | os.js | real | tasks | Patch update |
| os.complete_task | os.js | real | tasks | Status update |
| os.defer_task | os.js | real | tasks | Due date update |
| os.list_tasks | os.js | real | tasks | Filtered select |
| os.create_reminder | os.js | real | tasks | Stored as task with due_at |
| os.audit_log_search | os.js | real | core_tool_receipts | Receipt search |
| os.rollback_last_action | os.js | real | - | Placeholder (returns false) |

### identity.* (Identity/Self-Model Tools)

| tool_name | handler_file | status | db_tables_touched | notes |
|-----------|--------------|--------|-------------------|-------|
| identity.get_self_model | identity.js | not_configured | - | Requires identity tables |
| identity.update_self_model | identity.js | not_configured | - | Requires identity tables |
| identity.add_memory | identity.js | not_configured | - | Requires memory tables |
| identity.expire_memory | identity.js | not_configured | - | Requires memory tables |
| identity.list_memories | identity.js | not_configured | - | Requires memory tables |
| identity.score_pattern | identity.js | not_configured | - | Requires memory tables |
| identity.set_boundaries | identity.js | not_configured | - | Requires identity tables |

### entity.* (Entity Management Tools)

| tool_name | handler_file | status | db_tables_touched | notes |
|-----------|--------------|--------|-------------------|-------|
| entity.create | entity.js | real | entities | Full DB insert |
| entity.update | entity.js | real | entities | Patch update |
| entity.search | entity.js | real | entities | Name search |
| entity.get | entity.js | real | entities | Single select |
| entity.link_to_conversation | entity.js | real | entities | Metadata update |
| entity.add_interaction | entity.js | real | interactions | Full DB insert |
| entity.add_address_site_details | entity.js | real | entities | Site details update |

### leads.* (Lead Management Tools)

| tool_name | handler_file | status | db_tables_touched | notes |
|-----------|--------------|--------|-------------------|-------|
| leads.create | leads.js | real | leads | Keyed idempotency by phone |
| leads.update_stage | leads.js | real | leads | Status update |
| leads.add_source | leads.js | real | leads | Source update |
| leads.add_photos_link | leads.js | real | leads | Photo links append |
| leads.schedule_inspection | leads.js | real | leads | Status update |
| leads.list_by_stage | leads.js | real | leads | Filtered select |
| leads.mark_lost | leads.js | real | leads | Status update |

### inspection.* (Inspection Tools)

| tool_name | handler_file | status | db_tables_touched | notes |
|-----------|--------------|--------|-------------------|-------|
| inspection.create | inspection.js | not_configured | - | Requires inspection tables |
| inspection.add_checklist_item | inspection.js | not_configured | - | Requires inspection tables |
| inspection.add_measurement | inspection.js | not_configured | - | Requires inspection tables |
| inspection.add_photo_ref | inspection.js | not_configured | - | Requires inspection tables |
| inspection.add_defect | inspection.js | not_configured | - | Requires inspection tables |
| inspection.generate_scope_summary | inspection.js | not_configured | - | Requires LLM provider |
| inspection.lock | inspection.js | not_configured | - | Requires inspection tables |

### quote.* (Quote Management Tools)

| tool_name | handler_file | status | db_tables_touched | notes |
|-----------|--------------|--------|-------------------|-------|
| quote.create_from_inspection | quote.js | real | quotes | Full DB insert |
| quote.update_line_items | quote.js | real | quote_line_items | Replace all items |
| quote.calculate_totals | quote.js | real | quotes, quote_line_items | Aggregate and update |
| quote.generate_pdf | quote.js | real | - | Returns placeholder file_ref |
| quote.send_to_client | quote.js | real | - | Returns placeholder (sent:true) |
| quote.mark_accepted | quote.js | real | quotes | Status update |
| quote.mark_declined | quote.js | real | quotes | Status update |

### job.* (Job Management Tools)

| tool_name | handler_file | status | db_tables_touched | notes |
|-----------|--------------|--------|-------------------|-------|
| job.create_from_accepted_quote | job.js | real | jobs, quotes | Full DB insert |
| job.assign_dates | job.js | real | jobs | Date update |
| job.create_job_card | job.js | not_configured | - | Requires file generation |
| job.add_site_notes | job.js | real | jobs | Notes update |
| job.add_progress_update | job.js | real | job_updates, jobs | Insert + status update |
| job.add_before_after_refs | job.js | real | jobs | Media refs update |
| job.complete | job.js | real | jobs | Status update |
| job.generate_warranty_certificate | job.js | not_configured | - | Requires PDF generation |
| job.request_review | job.js | not_configured | - | Requires SMS/email provider |

### invoice.* (Invoice Tools)

| tool_name | handler_file | status | db_tables_touched | notes |
|-----------|--------------|--------|-------------------|-------|
| invoice.create_from_job | invoice.js | real | invoices, jobs, quotes | Full DB insert |
| invoice.send | invoice.js | not_configured | - | Requires email/SMS provider |
| invoice.add_payment | invoice.js | real | payments, invoices | Insert + balance update |
| invoice.mark_overdue | invoice.js | real | invoices | Status update |
| invoice.send_reminder_sms | invoice.js | not_configured | - | Requires SMS provider |
| invoice.send_reminder_email | invoice.js | not_configured | - | Requires email provider |

### finance.* (Finance Tools)

| tool_name | handler_file | status | db_tables_touched | notes |
|-----------|--------------|--------|-------------------|-------|
| finance.generate_cashflow_snapshot | finance.js | real | invoices | Aggregate query |
| finance.generate_pnl_snapshot | finance.js | real | invoices | Aggregate query |

### comms.* (Communications Tools)

| tool_name | handler_file | status | db_tables_touched | notes |
|-----------|--------------|--------|-------------------|-------|
| comms.compose_sms | comms.js | not_configured | - | Requires LLM provider |
| comms.send_sms | comms.js | not_configured | - | Requires SMS provider |
| comms.compose_email | comms.js | not_configured | - | Requires LLM provider |
| comms.send_email | comms.js | not_configured | - | Requires email provider |
| comms.log_call_outcome | comms.js | real | comms_log, interactions | Full DB insert |
| comms.create_followup_task_from_message | comms.js | real | tasks | Full DB insert |

### calendar.* (Calendar Tools)

| tool_name | handler_file | status | db_tables_touched | notes |
|-----------|--------------|--------|-------------------|-------|
| calendar.find_slots | calendar.js | not_configured | - | Requires Google Calendar API |
| calendar.create_event | calendar.js | not_configured | - | Requires Google Calendar API |
| calendar.update_event | calendar.js | not_configured | - | Requires Google Calendar API |
| calendar.cancel_event | calendar.js | not_configured | - | Requires Google Calendar API |
| calendar.attach_job_to_event | calendar.js | not_configured | - | Requires Google Calendar API |

### media.* (Media Management Tools)

| tool_name | handler_file | status | db_tables_touched | notes |
|-----------|--------------|--------|-------------------|-------|
| media.register_asset | media.js | not_configured | - | Requires media assets table |
| media.tag_asset | media.js | not_configured | - | Requires media assets table |
| media.generate_alt_text | media.js | not_configured | - | Requires LLM provider |
| media.generate_caption | media.js | not_configured | - | Requires LLM provider |
| media.propose_rename_map | media.js | not_configured | - | Requires media assets table |
| media.export_website_pack | media.js | not_configured | - | Requires file generation |

### marketing.* (Marketing Tools)

| tool_name | handler_file | status | db_tables_touched | notes |
|-----------|--------------|--------|-------------------|-------|
| marketing.generate_meta_ad_pack | marketing.js | not_configured | - | Requires LLM provider |
| marketing.generate_google_ads_pack | marketing.js | not_configured | - | Requires LLM provider |
| marketing.generate_case_study_from_job | marketing.js | not_configured | - | Requires LLM provider |
| marketing.generate_gmb_post | marketing.js | not_configured | - | Requires LLM provider |
| marketing.schedule_content | marketing.js | real | tasks | Creates tasks for content |
| marketing.log_campaign_result | marketing.js | real | notes | Logs as note |

### personal.* (Personal Tools)

| tool_name | handler_file | status | db_tables_touched | notes |
|-----------|--------------|--------|-------------------|-------|
| personal.check_in | personal.js | real | notes | Stored as note |
| personal.create_commitment | personal.js | real | tasks | Stored as task |
| personal.review_commitments | personal.js | real | tasks | Filtered select |
| personal.decision_support | personal.js | not_configured | - | Requires LLM provider |
| personal.boundary_set | personal.js | not_configured | - | Requires identity tables |

### integrations.* (Integration Tools)

| tool_name | handler_file | status | db_tables_touched | notes |
|-----------|--------------|--------|-------------------|-------|
| integrations.google_drive.search | integrations.js | not_configured | - | Requires GOOGLE_DRIVE_CREDENTIALS |
| integrations.google_photos.import_links | integrations.js | not_configured | - | Requires GOOGLE_PHOTOS_CREDENTIALS |
| integrations.analytics.pull_summary | integrations.js | not_configured | - | Requires GA4_CREDENTIALS |
| integrations.ads.pull_summary | integrations.js | not_configured | - | Requires GOOGLE_ADS/META_ADS_CREDENTIALS |
| integrations.sms_provider.health | integrations.js | not_configured | - | Requires TWILIO_ACCOUNT_SID |
| integrations.email_provider.health | integrations.js | not_configured | - | Requires SENDGRID_API_KEY |

---

## Tables Used

| Table | Handler(s) | Operations |
|-------|-----------|------------|
| core_tool_calls | os.health_check | SELECT |
| core_tool_receipts | os.audit_log_search | SELECT |
| notes | os.create_note, os.search_notes, marketing.log_campaign_result, personal.check_in | INSERT, SELECT |
| tasks | os.create_task, os.update_task, os.complete_task, os.defer_task, os.list_tasks, os.create_reminder, comms.create_followup_task_from_message, marketing.schedule_content, personal.create_commitment, personal.review_commitments | INSERT, UPDATE, SELECT |
| leads | leads.* | INSERT, UPDATE, SELECT |
| quotes | quote.* | INSERT, UPDATE, SELECT |
| quote_line_items | quote.update_line_items, quote.calculate_totals | INSERT, DELETE, SELECT |
| entities | entity.* | INSERT, UPDATE, SELECT |
| interactions | entity.add_interaction, comms.log_call_outcome | INSERT |
| jobs | job.* | INSERT, UPDATE, SELECT |
| job_updates | job.add_progress_update | INSERT |
| invoices | invoice.*, finance.* | INSERT, UPDATE, SELECT |
| payments | invoice.add_payment | INSERT |
| comms_log | comms.log_call_outcome | INSERT |

---

## Idempotency Modes

| Mode | Tools Using |
|------|-------------|
| safe-retry | Most read operations, os.health_check, entity.get, leads.list_by_stage, etc. |
| keyed | leads.create (phone), identity.add_memory (key), identity.score_pattern (key), media.register_asset (file_ref), personal.boundary_set (key) |
| none | os.create_note, os.create_task, entity.create, entity.add_interaction, inspection.*, job.add_progress_update, etc. |

---

## Next Steps for Full Coverage

1. **Identity Domain**: Add identity/memory tables and implement handlers
2. **Inspection Domain**: Add inspection tables and implement handlers
3. **Calendar Domain**: Configure Google Calendar API credentials
4. **Media Domain**: Add media_assets table and implement handlers
5. **SMS/Email Providers**: Configure Twilio and SendGrid credentials
6. **LLM Provider**: Configure for content generation tools
