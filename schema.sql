-- SUCCESS SKILL starter schema
-- Run this entire file in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  referral_code text unique not null,
  referred_by uuid references public.profiles(id),
  role text not null default 'customer' check (role in ('customer','admin')),
  rank text not null default 'Platinum' check (rank in ('Platinum','Silver','Gold','Diamond','Crown')),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'SUCCESS SKILL eBook',
  description text not null default 'Digital eBook',
  price integer not null default 600 check (price > 0),
  storage_path text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id),
  product_id uuid not null references public.products(id),
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','paid','rejected','refunded')),
  retail_verified boolean not null default false,
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  payment_verified_at timestamptz,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table if not exists public.commission_settings (
  id integer primary key default 1 check (id=1),
  direct_sales_rate numeric(5,2) not null default 0 check (direct_sales_rate >= 0 and direct_sales_rate <= 100),
  enabled boolean not null default false
);
insert into public.commission_settings(id,direct_sales_rate,enabled)
values(1,0,false) on conflict(id) do nothing;

create table if not exists public.sales_commissions (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.profiles(id),
  source_order_id uuid not null unique references public.orders(id),
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','approved','paid','cancelled')),
  created_at timestamptz not null default now()
);

-- Create a profile at signup; referral code is captured from signup metadata.
create or replace function public.make_referral_code() returns text
language sql volatile as $$
  select upper(substr(encode(gen_random_bytes(8),'hex'),1,10));
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare referrer uuid; new_code text;
begin
  if nullif(new.raw_user_meta_data->>'referral_code','') is not null then
    select id into referrer from public.profiles
    where referral_code = upper(trim(new.raw_user_meta_data->>'referral_code'));
  end if;
  new_code := public.make_referral_code();
  insert into public.profiles(id,email,full_name,referral_code,referred_by)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''),new_code,
         case when referrer = new.id then null else referrer end);
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;

-- Only admin-approved, verified retail sales can create a direct commission.
create or replace function public.create_verified_sale_commission() returns trigger
language plpgsql security definer set search_path=public as $$
declare referrer uuid; rate numeric; active_plan boolean;
begin
  if new.status='paid' and new.retail_verified=true
     and (old.status is distinct from 'paid' or old.retail_verified is distinct from true) then
    select referred_by into referrer from public.profiles where id=new.buyer_id;
    select direct_sales_rate, enabled into rate, active_plan from public.commission_settings where id=1;
    if referrer is not null and active_plan=true and rate > 0 then
      insert into public.sales_commissions(beneficiary_id,source_order_id,amount)
      values(referrer,new.id,round(new.amount * rate / 100,2))
      on conflict(source_order_id) do nothing;
    end if;
  end if;
  if new.status in ('refunded','rejected') then
    update public.sales_commissions set status='cancelled'
    where source_order_id=new.id and status in ('pending','approved');
  end if;
  return new;
end; $$;

drop trigger if exists verified_sale_commission on public.orders;
create trigger verified_sale_commission after update of status,retail_verified on public.orders
for each row execute procedure public.create_verified_sale_commission();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.sales_commissions enable row level security;
alter table public.commission_settings enable row level security;

create policy "profiles read own or admin" on public.profiles for select to authenticated
using (id=auth.uid() or public.is_admin());
create policy "products visible" on public.products for select to anon,authenticated using (active=true or public.is_admin());
-- Orders are created only by the server-side Razorpay Edge Function using the service role.
drop policy if exists "customer create own pending order" on public.orders;
create policy "orders read own or admin" on public.orders for select to authenticated
using (buyer_id=auth.uid() or public.is_admin());
create policy "admin update orders" on public.orders for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "commissions read own or admin" on public.sales_commissions for select to authenticated
using (beneficiary_id=auth.uid() or public.is_admin());
create policy "settings read" on public.commission_settings for select to authenticated
using (public.is_admin());

-- Admin-only writes for catalog and commission configuration.
create policy "admin manage products" on public.products for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "admin manage commission settings" on public.commission_settings for all to authenticated
using (public.is_admin()) with check (public.is_admin());

insert into public.products(title,description,price,active)
select 'SUCCESS SKILL eBook','The same digital eBook for every customer. PDF will be added by the administrator.',600,true
where not exists(select 1 from public.products);

-- After creating your account, promote it to admin in SQL Editor:
-- update public.profiles set role='admin' where email='YOUR-ADMIN-EMAIL';
-- Set commission rate only after independent legal review:
-- update public.commission_settings set direct_sales_rate=5, enabled=true where id=1;
-- Example above is illustrative only; do not activate an unreviewed rate.
