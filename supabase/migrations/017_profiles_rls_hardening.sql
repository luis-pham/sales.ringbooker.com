-- Remove the recursive admin policy on profiles.
-- Admin profile reads/writes are performed through server-side service-role clients.

drop policy if exists profiles_admin_all on profiles;
