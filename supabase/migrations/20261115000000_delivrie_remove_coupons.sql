-- Coupons were removed (reverted). Drops everything 20261114260000_delivrie_coupons.sql created.
drop function if exists public.admin_coupon_redemptions(uuid);
drop function if exists public.admin_set_coupon_active(uuid, boolean);
drop function if exists public.admin_create_coupon(jsonb);
drop function if exists public.admin_coupons();
drop function if exists public.redeem_coupon(uuid, uuid, text, text, text, text, bigint, bigint);
drop table if exists public.coupon_redemptions;
drop table if exists public.coupons;
