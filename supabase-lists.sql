-- Lists table
create table lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  name       text not null,
  color      text default '#a78bfa',
  created_at timestamptz default now()
);

alter table lists enable row level security;

create policy "Users can manage their own lists"
  on lists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Link todos to lists
alter table todos add column list_id uuid references lists(id) on delete set null;
