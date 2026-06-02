create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'outreacher' check (role in ('outreacher', 'viewer')),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid not null references profiles(id) on delete cascade,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

alter table invitations enable row level security;

create policy invitations_admin_all
  on invitations for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy invitations_select_accepted_self
  on invitations for select
  using (
    accepted_at is not null
    and email = (auth.jwt() ->> 'email')
  );

create index if not exists invitations_email_idx on invitations(email);
create index if not exists invitations_token_idx on invitations(token);
create index if not exists invitations_expires_idx on invitations(expires_at);
