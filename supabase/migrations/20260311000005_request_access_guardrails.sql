alter table public.tenant_access_requests
  add column if not exists request_ip text,
  add column if not exists request_origin text,
  add column if not exists user_agent text,
  add column if not exists requester_confirmation_status text not null default 'pending'
    check (requester_confirmation_status in ('pending', 'sent', 'failed', 'skipped')),
  add column if not exists requester_confirmation_error text,
  add column if not exists requester_confirmation_sent_at timestamptz;

comment on column public.tenant_access_requests.request_ip is
  'First public client IP observed from the request headers. Used for lightweight rate limiting and abuse review.';

comment on column public.tenant_access_requests.request_origin is
  'Origin header captured for public intake requests.';

comment on column public.tenant_access_requests.requester_confirmation_status is
  'Tracks the applicant-facing confirmation email delivery state.';

create index if not exists tenant_access_requests_request_ip_created_idx
  on public.tenant_access_requests (request_ip, created_at desc)
  where request_ip is not null;
