insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

do $$
begin
  execute 'drop policy if exists evidence_upload_authenticated on storage.objects';
  execute 'drop policy if exists evidence_read_own on storage.objects';
  execute 'drop policy if exists evidence_delete_own on storage.objects';
end $$;

create policy evidence_upload_authenticated
  on storage.objects for insert
  with check (
    bucket_id = 'evidence'
    and auth.uid() is not null
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy evidence_read_own
  on storage.objects for select
  using (
    bucket_id = 'evidence'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    )
  );

create policy evidence_delete_own
  on storage.objects for delete
  using (bucket_id = 'evidence' and auth.uid()::text = (storage.foldername(name))[1]);
