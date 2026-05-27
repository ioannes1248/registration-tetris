create table if not exists public.user_department_preferences (
  email text primary key,
  major_department text,
  minor_department text,
  updated_at timestamptz not null default now()
);

alter table public.user_department_preferences enable row level security;

drop policy if exists "Users can read own department preferences"
on public.user_department_preferences;

create policy "Users can read own department preferences"
on public.user_department_preferences
for select
using (auth.jwt() ->> 'email' = email);

drop policy if exists "Users can insert own department preferences"
on public.user_department_preferences;

create policy "Users can insert own department preferences"
on public.user_department_preferences
for insert
with check (auth.jwt() ->> 'email' = email);

drop policy if exists "Users can update own department preferences"
on public.user_department_preferences;

create policy "Users can update own department preferences"
on public.user_department_preferences
for update
using (auth.jwt() ->> 'email' = email)
with check (auth.jwt() ->> 'email' = email);

create or replace function public.set_user_department_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_department_preferences_updated_at
on public.user_department_preferences;

create trigger set_user_department_preferences_updated_at
before update on public.user_department_preferences
for each row
execute function public.set_user_department_preferences_updated_at();
