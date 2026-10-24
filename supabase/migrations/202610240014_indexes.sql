-- Speed-ups for when there's lots of data (run any time; safe to run more than once).
create index if not exists resumes_ws_idx on public.resumes (workspace_id, updated_at desc);
create index if not exists invoice_customers_ws_idx on public.invoice_customers (workspace_id, name);
create index if not exists invoices_customer_idx on public.invoices (customer_id);
create index if not exists invoices_related_idx on public.invoices (related_id);
create index if not exists signature_signers_ws_idx on public.signature_signers (workspace_id);
create index if not exists signature_events_ws_idx on public.signature_events (workspace_id);
create index if not exists signature_events_signer_idx on public.signature_events (signer_id);
create index if not exists agreement_versions_ws_idx on public.agreement_versions (workspace_id);
create index if not exists audit_logs_ws_idx on public.audit_logs (workspace_id, created_at desc);
create index if not exists files_uploaded_by_idx on public.files (uploaded_by);
