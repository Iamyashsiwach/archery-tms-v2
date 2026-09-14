-- archery-tms v2 — accepting an invite
--
-- memberships has no write policy, so the invitee cannot activate their own
-- row through RLS. This function is the one door: it activates a membership
-- only for the signed-in user whose confirmed email the invite was sent to,
-- and records it in audit_log. It runs with the caller's session, so no
-- service-role key is involved.

create or replace function accept_membership(p_membership uuid)
returns table (tournament_id uuid, tournament_name text, role text)
language plpgsql security definer set search_path = public as $$
declare
  m memberships;
  v_email text;
begin
  -- Read from auth.users, not the JWT: the token can outlive an email change.
  select u.email into v_email
  from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;

  select * into m from memberships where id = p_membership for update;

  -- One answer for "no such invite" and "not yours", so invite ids cannot be
  -- probed to learn who was invited.
  if v_email is null or m.id is null or lower(m.invited_email::text) <> lower(v_email) then
    raise exception 'invite_not_found' using errcode = 'insufficient_privilege';
  end if;

  -- Opening the link twice is not an error.
  if m.status = 'ACTIVE' and m.user_id = auth.uid() then
    return query select t.id, t.name, m.role from tournaments t where t.id = m.tournament_id;
    return;
  end if;

  if m.status <> 'INVITED' then
    raise exception 'invite_unavailable' using errcode = 'insufficient_privilege';
  end if;

  if m.expires_at <= now() then
    raise exception 'invite_expired' using errcode = 'insufficient_privilege';
  end if;

  update memberships
  set user_id = auth.uid(), status = 'ACTIVE', accepted_at = now()
  where id = m.id;

  insert into audit_log (tournament_id, actor_id, action, entity, entity_id, before, after)
  select m.tournament_id, auth.uid(), 'MEMBERSHIP_ACCEPT', 'memberships', m.id, to_jsonb(m), to_jsonb(a)
  from memberships a where a.id = m.id;

  return query select t.id, t.name, m.role from tournaments t where t.id = m.tournament_id;
end $$;

revoke execute on function accept_membership(uuid) from public, anon;
grant execute on function accept_membership(uuid) to authenticated;
