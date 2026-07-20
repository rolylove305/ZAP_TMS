-- The quick "Upload Rate Confirmation" flow stores the PDF before the load exists,
-- so load_documents rows must allow a null load_id. No-op if already nullable.
alter table public.load_documents alter column load_id drop not null;
