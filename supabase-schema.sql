-- Run this in your Supabase SQL editor

create table todos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  title       text not null,
  done        boolean default false,
  priority    text default 'med' check (priority in ('low', 'med', 'high')),
  due_date    date,
  created_at  timestamptz default now()
);

-- Row-level security: users can only see/edit their own todos
alter table todos enable row level security;

create policy "Users can manage their own todos"
  on todos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
