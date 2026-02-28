create extension if not exists "uuid-ossp";

create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  username text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);

create table if not exists books (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  month text not null,
  title text not null,
  created_at timestamptz default now()
);
create index if not exists idx_books_user_month on books(user_id, month);

create table if not exists logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  date text not null,
  pages integer not null,
  book text,
  created_at timestamptz default now()
);
create index if not exists idx_logs_user_date on logs(user_id, date);
