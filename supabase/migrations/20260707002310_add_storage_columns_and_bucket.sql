alter table public.load_documents add column if not exists storage_bucket text;
alter table public.load_documents add column if not exists storage_path text;
alter table public.load_documents add column if not exists uploaded_by text default 'dispatcher';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('load-documents', 'load-documents', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;;
