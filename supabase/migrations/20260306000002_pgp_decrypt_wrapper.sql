-- Migration: pgp_sym_decrypt_text wrapper
-- Story 2.1/2.2 — Epic 2 Hire Detection
--
-- Companion to migration 003 (pgp_sym_encrypt_text).
-- Allows Edge Functions to decrypt API keys stored in tenant_settings
-- without exposing the pgcrypto extension directly.
--
-- Called via: supabase.rpc('pgp_sym_decrypt_text', { ciphertext, passphrase })
-- Only callable by service_role (EFs use service role key — no user JWT in cron context).

CREATE OR REPLACE FUNCTION public.pgp_sym_decrypt_text(ciphertext TEXT, passphrase TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = extensions, public, pg_temp
AS $$
  SELECT extensions.pgp_sym_decrypt(ciphertext::bytea, passphrase)::TEXT;
$$;

-- Restrict to service_role only — never expose to authenticated/anon
REVOKE ALL ON FUNCTION public.pgp_sym_decrypt_text(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pgp_sym_decrypt_text(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pgp_sym_decrypt_text(TEXT, TEXT) TO service_role;
