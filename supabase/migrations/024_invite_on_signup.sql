-- Update handle_new_user() trigger:
-- New Google sign-ins are inactive by default unless their email has a valid invitation.
-- This means: admin invites email → person signs in with that Google account → auto-activated.
-- No invite link sharing needed.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    text    := 'outreacher';
  v_active  boolean := false;
  v_inv_id  uuid;
begin
  -- Check for a valid pending invitation matching this email
  select id, role
  into   v_inv_id, v_role
  from   invitations
  where  lower(email) = lower(new.email)
    and  accepted_at is null
    and  expires_at  > now()
  limit 1;

  if v_inv_id is not null then
    v_active := true;
    update invitations set accepted_at = now() where id = v_inv_id;
  end if;

  insert into profiles (id, email, full_name, avatar_url, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    v_role,
    v_active
  )
  on conflict (id) do update
    set full_name  = excluded.full_name,
        avatar_url = excluded.avatar_url,
        updated_at = now();
  -- Note: is_active and role are intentionally NOT overwritten on conflict
  -- so existing active users keep their access after re-login.

  return new;
end;
$$;
