-- Migration: pgp_sym_encrypt_text wrapper
--
-- Provides a callable RPC function that Edge Functions use to encrypt API keys
-- at rest without needing to handle the pgcrypto passphrase in application code.
-- The passphrase is stored as a Postgres secret (vault or app.settings).
--
-- Used by: supabase/functions/save-connector/index.ts
-- Called via: supabase.rpc('pgp_sym_encrypt_text', { plaintext, passphrase })

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Wrapper so Edge Functions can call via .rpc() without needing superuser pgcrypto access.
CREATE OR REPLACE FUNCTION public.pgp_sym_encrypt_text(plaintext TEXT, passphrase TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT extensions.pgp_sym_encrypt(plaintext, passphrase)::TEXT;
$$;

-- Only authenticated users (Edge Functions running as service role) may call this.
REVOKE ALL ON FUNCTION public.pgp_sym_encrypt_text(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pgp_sym_encrypt_text(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pgp_sym_encrypt_text(TEXT, TEXT) TO service_role;
