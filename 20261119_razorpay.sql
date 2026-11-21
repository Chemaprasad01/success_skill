-- Apply this migration to an existing SUCCESS SKILL Supabase project.
-- Safe to re-run. Customers can no longer create arbitrary orders from the browser.
alter table public.orders add column if not exists razorpay_order_id text;
alter table public.orders add column if not exists razorpay_payment_id text;
alter table public.orders add column if not exists payment_verified_at timestamptz;

create unique index if not exists orders_razorpay_order_id_uidx
  on public.orders(razorpay_order_id) where razorpay_order_id is not null;
create unique index if not exists orders_razorpay_payment_id_uidx
  on public.orders(razorpay_payment_id) where razorpay_payment_id is not null;

drop policy if exists "customer create own pending order" on public.orders;

-- Existing customer/admin read policies and the admin-only update policy remain in place.
