


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'staff'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_ai_cache"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    coalesce(new.tenant_id, old.tenant_id),
    (auth.jwt() ->> 'sub')::uuid,
    tg_op,
    'ai_cache',
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."audit_ai_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_offers"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    coalesce(new.tenant_id, old.tenant_id),
    (auth.jwt() ->> 'sub')::uuid,
    tg_op,
    'offers',
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."audit_offers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_people"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    new.tenant_id,
    (auth.jwt() ->> 'sub')::uuid,
    tg_op,
    'people',
    new.id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."audit_people"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_tenant_settings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    new.tenant_id,
    (auth.jwt() ->> 'sub')::uuid,
    tg_op,
    'tenant_settings',
    new.tenant_id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."audit_tenant_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_tenant_users"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    new.tenant_id,
    (auth.jwt() ->> 'sub')::uuid,
    tg_op,
    'tenant_users',
    new.id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."audit_tenant_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_training_adjustments"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    new.tenant_id,
    (auth.jwt() ->> 'sub')::uuid,
    tg_op,
    'training_adjustments',
    new.id,
    null,           -- append-only: no old row
    to_jsonb(new)
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."audit_training_adjustments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_training_events"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    new.tenant_id,
    (auth.jwt() ->> 'sub')::uuid,
    tg_op,
    'training_events',
    new.id,
    null,           -- insert-only: no old row
    to_jsonb(new)
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."audit_training_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_training_records"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    coalesce(new.tenant_id, old.tenant_id),
    (auth.jwt() ->> 'sub')::uuid,
    tg_op,
    'training_records',
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."audit_training_records"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."custom_access_token_hook"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
declare
  claims       jsonb;
  tu           record;
  user_id_val  uuid;
begin
  user_id_val := (event ->> 'user_id')::uuid;
  claims := event -> 'claims';

  select tenant_id, role
  into tu
  from public.tenant_users
  where user_id = user_id_val
    and status = 'active'
  limit 1;

  if found then
    claims := jsonb_set(claims, '{app_metadata}',
      coalesce(claims -> 'app_metadata', '{}') ||
      jsonb_build_object(
        'tenant_id', tu.tenant_id,
        'role',      tu.role
      )
    );
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;


ALTER FUNCTION "public"."custom_access_token_hook"("event" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "public"."user_role"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN v_role;
END;
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'first_name',
        NEW.raw_user_meta_data->>'last_name',
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'staff'::user_role)
    );
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pgp_sym_decrypt_text"("ciphertext" "text", "passphrase" "text") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'extensions', 'public', 'pg_temp'
    AS $$
  SELECT extensions.pgp_sym_decrypt(ciphertext::bytea, passphrase)::TEXT;
$$;


ALTER FUNCTION "public"."pgp_sym_decrypt_text"("ciphertext" "text", "passphrase" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pgp_sym_encrypt_text"("plaintext" "text", "passphrase" "text") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT extensions.pgp_sym_encrypt(plaintext, passphrase)::TEXT;
$$;


ALTER FUNCTION "public"."pgp_sym_encrypt_text"("plaintext" "text", "passphrase" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_to_offer"("token_arg" "text", "status_arg" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  offer_record RECORD;
BEGIN
  SELECT * INTO offer_record FROM offers WHERE secure_token = token_arg;

  IF offer_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid token');
  END IF;

  UPDATE offers
  SET 
    status = status_arg,
    signed_at = CASE WHEN status_arg = 'Accepted' THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE id = offer_record.id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."respond_to_offer"("token_arg" "text", "status_arg" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."training_adjustments_event_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.training_events (tenant_id, person_id, course_id, event_type, payload)
  values (
    new.tenant_id,
    new.person_id,
    new.course_id,
    'adjusted',
    jsonb_build_object(
      'field', new.field,
      'value', new.value,
      'reason', new.reason,
      'actor_id', new.actor_id
    )
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."training_adjustments_event_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."training_records_event_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if tg_op = 'INSERT' then
    insert into public.training_events (tenant_id, person_id, course_id, event_type, payload)
    values (
      new.tenant_id,
      new.person_id,
      new.course_id,
      'enrolled',
      jsonb_build_object(
        'course_name', new.course_name,
        'enrolled_at', new.enrolled_at,
        'source', 'learndash_sync'
      )
    );
  elsif tg_op = 'UPDATE'
    and new.status = 'completed'
    and (old.status is distinct from 'completed')
  then
    insert into public.training_events (tenant_id, person_id, course_id, event_type, payload)
    values (
      new.tenant_id,
      new.person_id,
      new.course_id,
      'completed',
      jsonb_build_object(
        'course_name', new.course_name,
        'completed_at', new.completed_at,
        'completion_pct', new.completion_pct,
        'source', 'learndash_sync'
      )
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."training_records_event_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_cache" (
    "input_hash" "text" NOT NULL,
    "output" "jsonb",
    "model" "text",
    "ttl_seconds" integer DEFAULT 86400,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."ai_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text",
    "user_id" "uuid",
    "feature" "text",
    "model" "text",
    "tokens_in" integer DEFAULT 0,
    "tokens_out" integer DEFAULT 0,
    "success" boolean DEFAULT false,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."applicants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "airtable_id" "text",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "position_applied" "text",
    "status" "text" DEFAULT 'New'::"text" NOT NULL,
    "resume_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "resume_text" "text",
    "jotform_id" "text",
    "tenant_id" "uuid" NOT NULL,
    "source" "text",
    CONSTRAINT "applicants_source_check" CHECK (("source" = ANY (ARRAY['jotform'::"text", 'bamboohr'::"text", 'jazzhr'::"text"]))),
    CONSTRAINT "applicants_status_check" CHECK (("status" = ANY (ARRAY['New'::"text", 'Screening'::"text", 'Interview'::"text", 'Offer'::"text", 'Hired'::"text", 'Rejected'::"text"])))
);


ALTER TABLE "public"."applicants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid",
    "before" "jsonb",
    "after" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_log" IS 'Append-only audit trail. NFR-4: every write operation must produce a row here.';



CREATE TABLE IF NOT EXISTS "public"."integration_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "status" "text" NOT NULL,
    "payload" "jsonb",
    "last_received_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "rows_processed" integer,
    "error_count" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."integration_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."integration_log" IS 'Idempotency log for all external integrations. UNIQUE constraint on (tenant_id, source, idempotency_key) is the primary guard against duplicate hire events.';



CREATE TABLE IF NOT EXISTS "public"."offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "applicant_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'Draft'::"text" NOT NULL,
    "position_title" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "salary" numeric NOT NULL,
    "offer_letter_url" "text",
    "secure_token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(32), 'hex'::"text"),
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "signed_at" timestamp with time zone,
    "tenant_id" "uuid" NOT NULL,
    CONSTRAINT "offers_status_check" CHECK (("status" = ANY (ARRAY['Draft'::"text", 'Pending_Approval'::"text", 'Sent'::"text", 'Accepted'::"text", 'Declined'::"text"])))
);


ALTER TABLE "public"."offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."people" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "job_title" "text",
    "type" "text" DEFAULT 'candidate'::"text" NOT NULL,
    "profile_source" "text",
    "hired_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "wp_user_id" integer,
    "phone" "text",
    "department" "text",
    "employee_id" "text",
    "employee_status" "text" DEFAULT 'Active'::"text",
    "applicant_id" "uuid",
    CONSTRAINT "people_employee_status_check" CHECK ((("employee_status" IS NULL) OR ("employee_status" = ANY (ARRAY['Active'::"text", 'Onboarding'::"text", 'Terminated'::"text"])))),
    CONSTRAINT "people_profile_source_check" CHECK (("profile_source" = ANY (ARRAY['bamboohr'::"text", 'jazzhr'::"text", 'wordpress'::"text"]))),
    CONSTRAINT "people_type_check" CHECK (("type" = ANY (ARRAY['candidate'::"text", 'employee'::"text"])))
);


ALTER TABLE "public"."people" OWNER TO "postgres";


COMMENT ON TABLE "public"."people" IS 'All persons associated with a tenant — candidates and employees. (tenant_id, email) is the universal deduplication key.';



COMMENT ON COLUMN "public"."people"."hired_at" IS 'NFR-3: Set once when hire is first detected. Sync NEVER overwrites this if already populated.';



COMMENT ON COLUMN "public"."people"."wp_user_id" IS 'WordPress user ID after onboarding. NULL = not yet created in WP.';



CREATE TABLE IF NOT EXISTS "public"."tenant_settings" (
    "tenant_id" "uuid" NOT NULL,
    "wp_site_url" "text",
    "wp_username_encrypted" "text",
    "wp_app_password_encrypted" "text",
    "bamboohr_subdomain" "text",
    "bamboohr_api_key_encrypted" "text",
    "jazzhr_api_key_encrypted" "text",
    "active_connectors" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "ld_group_mappings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "profile_source" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "jotform_api_key_encrypted" "text",
    "jotform_form_id_application" "text",
    "jotform_form_id_emergency" "text",
    "jotform_form_id_i9" "text",
    "jotform_form_id_vaccination" "text",
    "jotform_form_id_licenses" "text",
    "jotform_form_id_background" "text",
    "brevo_api_key_encrypted" "text",
    "logo_light" "text",
    CONSTRAINT "tenant_settings_profile_source_check" CHECK ((("profile_source" IS NULL) OR ("profile_source" = ANY (ARRAY['bamboohr'::"text", 'jazzhr'::"text", 'wordpress'::"text"]))))
);


ALTER TABLE "public"."tenant_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."tenant_settings" IS 'Per-tenant configuration: connector credentials (encrypted), LearnDash mappings, profile source priority.';



COMMENT ON COLUMN "public"."tenant_settings"."bamboohr_api_key_encrypted" IS 'Encrypted with pgcrypto. Decrypted ONLY inside Edge Functions. Never transmitted to frontend.';



COMMENT ON COLUMN "public"."tenant_settings"."jazzhr_api_key_encrypted" IS 'Encrypted with pgcrypto. Decrypted ONLY inside Edge Functions. Never transmitted to frontend.';



COMMENT ON COLUMN "public"."tenant_settings"."profile_source" IS 'Set once at connector setup. Sync respects this — only the priority source overwrites profile fields. FR-22.';



COMMENT ON COLUMN "public"."tenant_settings"."jotform_api_key_encrypted" IS 'Encrypted with pgcrypto. Decrypted ONLY inside Edge Functions. Never transmitted to frontend.';



CREATE TABLE IF NOT EXISTS "public"."tenant_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_users_role_check" CHECK (("role" = ANY (ARRAY['platform_admin'::"text", 'tenant_admin'::"text", 'hr_admin'::"text"]))),
    CONSTRAINT "tenant_users_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'pending'::"text", 'deactivated'::"text"])))
);


ALTER TABLE "public"."tenant_users" OWNER TO "postgres";


COMMENT ON TABLE "public"."tenant_users" IS 'Links Supabase auth users to tenants with roles. The source of truth for JWT app_metadata claims.';



CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


COMMENT ON TABLE "public"."tenants" IS 'One row per client organisation. slug is used in WP sub-site URLs (post-MVP).';



CREATE TABLE IF NOT EXISTS "public"."training_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "course_id" "text" NOT NULL,
    "field" "text" NOT NULL,
    "value" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "training_adjustments_field_check" CHECK (("field" = ANY (ARRAY['status'::"text", 'completion_pct'::"text", 'completed_at'::"text", 'training_hours'::"text"])))
);


ALTER TABLE "public"."training_adjustments" OWNER TO "postgres";


COMMENT ON TABLE "public"."training_adjustments" IS 'Layer B: HR overrides for training compliance. Append-only — no UPDATE or DELETE. Latest override per (person_id, course_id, field) wins.';



COMMENT ON COLUMN "public"."training_adjustments"."field" IS 'Which training_records field is being overridden. CHECK constraint enforces valid values.';



COMMENT ON COLUMN "public"."training_adjustments"."reason" IS 'Required justification for the override. Compliance audit trail.';



CREATE TABLE IF NOT EXISTS "public"."training_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "course_id" "text",
    "event_type" "text" NOT NULL,
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "training_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['enrolled'::"text", 'completed'::"text", 'expired'::"text", 'adjusted'::"text"])))
);


ALTER TABLE "public"."training_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."training_events" IS 'Immutable training event log. Auto-generated by DB triggers. INSERT-only — no UPDATE or DELETE.';



CREATE TABLE IF NOT EXISTS "public"."training_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "course_id" "text" NOT NULL,
    "course_name" "text",
    "status" "text",
    "completion_pct" integer,
    "completed_at" timestamp with time zone,
    "training_hours" integer,
    "expires_at" timestamp with time zone,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "enrolled_at" timestamp with time zone,
    CONSTRAINT "training_records_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."training_records" OWNER TO "postgres";


COMMENT ON TABLE "public"."training_records" IS 'Layer A: Raw training data synced from LearnDash. Sync overwrites on each pull. Never contains HR overrides.';



COMMENT ON COLUMN "public"."training_records"."training_hours" IS 'Training duration in minutes. Synced from LearnDash.';



COMMENT ON COLUMN "public"."training_records"."expires_at" IS 'Certification expiry date. Nullable — used for future expiration detection.';



COMMENT ON COLUMN "public"."training_records"."enrolled_at" IS 'Enrollment/first activity timestamp from LearnDash (date_started). Used for timeline "Enrolled" events.';



CREATE OR REPLACE VIEW "public"."v_training_compliance" AS
 WITH "latest_adjustments" AS (
         SELECT DISTINCT ON ("training_adjustments"."tenant_id", "training_adjustments"."person_id", "training_adjustments"."course_id", "training_adjustments"."field") "training_adjustments"."tenant_id",
            "training_adjustments"."person_id",
            "training_adjustments"."course_id",
            "training_adjustments"."field",
            "training_adjustments"."value",
            "training_adjustments"."created_at" AS "adjusted_at"
           FROM "public"."training_adjustments"
          ORDER BY "training_adjustments"."tenant_id", "training_adjustments"."person_id", "training_adjustments"."course_id", "training_adjustments"."field", "training_adjustments"."created_at" DESC
        ), "pivoted" AS (
         SELECT "latest_adjustments"."tenant_id",
            "latest_adjustments"."person_id",
            "latest_adjustments"."course_id",
            "max"(
                CASE
                    WHEN ("latest_adjustments"."field" = 'status'::"text") THEN "latest_adjustments"."value"
                    ELSE NULL::"text"
                END) AS "adj_status",
            "max"(
                CASE
                    WHEN ("latest_adjustments"."field" = 'completion_pct'::"text") THEN "latest_adjustments"."value"
                    ELSE NULL::"text"
                END) AS "adj_completion_pct",
            "max"(
                CASE
                    WHEN ("latest_adjustments"."field" = 'completed_at'::"text") THEN "latest_adjustments"."value"
                    ELSE NULL::"text"
                END) AS "adj_completed_at",
            "max"(
                CASE
                    WHEN ("latest_adjustments"."field" = 'training_hours'::"text") THEN "latest_adjustments"."value"
                    ELSE NULL::"text"
                END) AS "adj_training_hours",
            "max"("latest_adjustments"."adjusted_at") AS "last_adjusted_at"
           FROM "latest_adjustments"
          GROUP BY "latest_adjustments"."tenant_id", "latest_adjustments"."person_id", "latest_adjustments"."course_id"
        )
 SELECT "tr"."id" AS "training_record_id",
    "tr"."tenant_id",
    "tr"."person_id",
    "tr"."course_id",
    "tr"."course_name",
    COALESCE("p"."adj_status", "tr"."status") AS "effective_status",
    COALESCE(("p"."adj_completion_pct")::integer, "tr"."completion_pct") AS "effective_completion_pct",
    COALESCE(("p"."adj_completed_at")::timestamp with time zone, "tr"."completed_at") AS "effective_completed_at",
    COALESCE(("p"."adj_training_hours")::integer, "tr"."training_hours") AS "effective_training_hours",
    "tr"."status" AS "raw_status",
    "tr"."completion_pct" AS "raw_completion_pct",
    "tr"."completed_at" AS "raw_completed_at",
    "tr"."training_hours" AS "raw_training_hours",
    "tr"."expires_at",
    "tr"."last_synced_at",
    "p"."last_adjusted_at",
    (("p"."adj_status" IS NOT NULL) OR ("p"."adj_completion_pct" IS NOT NULL) OR ("p"."adj_completed_at" IS NOT NULL) OR ("p"."adj_training_hours" IS NOT NULL)) AS "has_overrides",
    "tr"."enrolled_at"
   FROM ("public"."training_records" "tr"
     LEFT JOIN "pivoted" "p" ON ((("p"."tenant_id" = "tr"."tenant_id") AND ("p"."person_id" = "tr"."person_id") AND ("p"."course_id" = "tr"."course_id"))));


ALTER VIEW "public"."v_training_compliance" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_training_compliance" IS 'Layer C: Effective training compliance values. Latest HR override (Layer B) wins over raw sync data (Layer A). Query this view for all compliance reporting.';



ALTER TABLE ONLY "public"."ai_cache"
    ADD CONSTRAINT "ai_cache_pkey" PRIMARY KEY ("input_hash");



ALTER TABLE ONLY "public"."ai_logs"
    ADD CONSTRAINT "ai_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."applicants"
    ADD CONSTRAINT "applicants_airtable_id_key" UNIQUE ("airtable_id");



ALTER TABLE ONLY "public"."applicants"
    ADD CONSTRAINT "applicants_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."applicants"
    ADD CONSTRAINT "applicants_jotform_id_key" UNIQUE ("jotform_id");



ALTER TABLE ONLY "public"."applicants"
    ADD CONSTRAINT "applicants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_log"
    ADD CONSTRAINT "integration_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_secure_token_key" UNIQUE ("secure_token");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_settings"
    ADD CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_tenant_id_user_id_key" UNIQUE ("tenant_id", "user_id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."training_adjustments"
    ADD CONSTRAINT "training_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_events"
    ADD CONSTRAINT "training_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_records"
    ADD CONSTRAINT "training_records_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "applicants_tenant_email_idx" ON "public"."applicants" USING "btree" ("tenant_id", "email");



CREATE INDEX "applicants_tenant_id_idx" ON "public"."applicants" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_cache_hash" ON "public"."ai_cache" USING "btree" ("input_hash");



CREATE INDEX "idx_ai_logs_tenant_created" ON "public"."ai_logs" USING "btree" ("tenant_id", "created_at");



CREATE UNIQUE INDEX "integration_log_idempotency_idx" ON "public"."integration_log" USING "btree" ("tenant_id", "source", "idempotency_key");



CREATE UNIQUE INDEX "people_tenant_email_idx" ON "public"."people" USING "btree" ("tenant_id", "email");



CREATE UNIQUE INDEX "training_records_tenant_person_course_idx" ON "public"."training_records" USING "btree" ("tenant_id", "person_id", "course_id");



CREATE OR REPLACE TRIGGER "audit_ai_cache_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."ai_cache" FOR EACH ROW EXECUTE FUNCTION "public"."audit_ai_cache"();



CREATE OR REPLACE TRIGGER "audit_offers_trigger" AFTER INSERT OR UPDATE ON "public"."offers" FOR EACH ROW EXECUTE FUNCTION "public"."audit_offers"();



CREATE OR REPLACE TRIGGER "audit_people_trigger" AFTER INSERT OR UPDATE ON "public"."people" FOR EACH ROW EXECUTE FUNCTION "public"."audit_people"();



CREATE OR REPLACE TRIGGER "audit_tenant_settings_trigger" AFTER INSERT OR UPDATE ON "public"."tenant_settings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_tenant_settings"();



CREATE OR REPLACE TRIGGER "audit_tenant_users_trigger" AFTER INSERT OR UPDATE ON "public"."tenant_users" FOR EACH ROW EXECUTE FUNCTION "public"."audit_tenant_users"();



CREATE OR REPLACE TRIGGER "audit_training_adjustments_trigger" AFTER INSERT ON "public"."training_adjustments" FOR EACH ROW EXECUTE FUNCTION "public"."audit_training_adjustments"();



CREATE OR REPLACE TRIGGER "audit_training_events_trigger" AFTER INSERT ON "public"."training_events" FOR EACH ROW EXECUTE FUNCTION "public"."audit_training_events"();



CREATE OR REPLACE TRIGGER "audit_training_records_trigger" AFTER INSERT OR UPDATE ON "public"."training_records" FOR EACH ROW EXECUTE FUNCTION "public"."audit_training_records"();



CREATE OR REPLACE TRIGGER "on_offer_accepted" AFTER UPDATE ON "public"."offers" FOR EACH ROW WHEN ((("old"."status" IS DISTINCT FROM 'Accepted'::"text") AND ("new"."status" = 'Accepted'::"text"))) EXECUTE FUNCTION "supabase_functions"."http_request"();



CREATE OR REPLACE TRIGGER "training_adjustments_event" AFTER INSERT ON "public"."training_adjustments" FOR EACH ROW EXECUTE FUNCTION "public"."training_adjustments_event_trigger"();



CREATE OR REPLACE TRIGGER "training_records_event" AFTER INSERT OR UPDATE ON "public"."training_records" FOR EACH ROW EXECUTE FUNCTION "public"."training_records_event_trigger"();



ALTER TABLE ONLY "public"."ai_cache"
    ADD CONSTRAINT "ai_cache_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."applicants"
    ADD CONSTRAINT "applicants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."integration_log"
    ADD CONSTRAINT "integration_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."tenant_settings"
    ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_adjustments"
    ADD CONSTRAINT "training_adjustments_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."training_adjustments"
    ADD CONSTRAINT "training_adjustments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "public"."training_adjustments"
    ADD CONSTRAINT "training_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."training_events"
    ADD CONSTRAINT "training_events_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "public"."training_events"
    ADD CONSTRAINT "training_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."training_records"
    ADD CONSTRAINT "training_records_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "public"."training_records"
    ADD CONSTRAINT "training_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



CREATE POLICY "Allow all access for authenticated users" ON "public"."applicants" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow full access for authenticated users" ON "public"."offers" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public read access via secure_token" ON "public"."offers" FOR SELECT TO "anon" USING (("secure_token" IS NOT NULL));



CREATE POLICY "Authenticated users can read cache" ON "public"."ai_cache" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read logs" ON "public"."ai_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Everyone can view offers" ON "public"."offers" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Service role can insert logs" ON "public"."ai_logs" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Service role full access cache" ON "public"."ai_cache" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access logs" ON "public"."ai_logs" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ai_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_cache_delete_own_tenant" ON "public"."ai_cache" FOR DELETE USING (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "ai_cache_insert_own_tenant" ON "public"."ai_cache" FOR INSERT WITH CHECK (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "ai_cache_select_own_tenant" ON "public"."ai_cache" FOR SELECT USING (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "ai_cache_update_own_tenant" ON "public"."ai_cache" FOR UPDATE USING (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid")) WITH CHECK (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



ALTER TABLE "public"."ai_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."applicants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "applicants_insert_own_tenant" ON "public"."applicants" FOR INSERT WITH CHECK (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "applicants_select_own_tenant" ON "public"."applicants" FOR SELECT USING ((("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid") OR ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'platform_admin'::"text")));



CREATE POLICY "applicants_update_own_tenant" ON "public"."applicants" FOR UPDATE USING (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_insert" ON "public"."audit_log" FOR INSERT WITH CHECK (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "audit_log_select_own" ON "public"."audit_log" FOR SELECT USING ((("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid") OR ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'platform_admin'::"text")));



ALTER TABLE "public"."integration_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integration_log_own_tenant" ON "public"."integration_log" USING ((("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid") OR ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'platform_admin'::"text")));



ALTER TABLE "public"."offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "offers_insert_own_tenant" ON "public"."offers" FOR INSERT WITH CHECK (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "offers_select_own_tenant" ON "public"."offers" FOR SELECT USING (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "offers_update_own_tenant" ON "public"."offers" FOR UPDATE USING (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid")) WITH CHECK (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



ALTER TABLE "public"."people" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "people_own_tenant" ON "public"."people" USING (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "platform_admin_all" ON "public"."tenants" USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'platform_admin'::"text"));



CREATE POLICY "tenant_read_own" ON "public"."tenants" FOR SELECT USING (("id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



ALTER TABLE "public"."tenant_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_settings_own_tenant" ON "public"."tenant_settings" USING (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



ALTER TABLE "public"."tenant_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_users_own_tenant" ON "public"."tenant_users" USING (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_adjustments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "training_adjustments_insert_own" ON "public"."training_adjustments" FOR INSERT WITH CHECK (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "training_adjustments_select_own" ON "public"."training_adjustments" FOR SELECT USING (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



ALTER TABLE "public"."training_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "training_events_insert_own" ON "public"."training_events" FOR INSERT WITH CHECK (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "training_events_select_own" ON "public"."training_events" FOR SELECT USING (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



ALTER TABLE "public"."training_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "training_records_insert" ON "public"."training_records" FOR INSERT WITH CHECK (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "training_records_select" ON "public"."training_records" FOR SELECT USING (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "training_records_update" ON "public"."training_records" FOR UPDATE USING (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid")) WITH CHECK (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_ai_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_ai_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_ai_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_offers"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_offers"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_offers"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_people"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_people"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_people"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_tenant_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_tenant_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_tenant_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_tenant_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_tenant_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_tenant_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_training_adjustments"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_training_adjustments"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_training_adjustments"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_training_events"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_training_events"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_training_events"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_training_records"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_training_records"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_training_records"() TO "service_role";



GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "supabase_auth_admin";



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pgp_sym_decrypt_text"("ciphertext" "text", "passphrase" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pgp_sym_decrypt_text"("ciphertext" "text", "passphrase" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgp_sym_decrypt_text"("ciphertext" "text", "passphrase" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pgp_sym_encrypt_text"("plaintext" "text", "passphrase" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pgp_sym_encrypt_text"("plaintext" "text", "passphrase" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgp_sym_encrypt_text"("plaintext" "text", "passphrase" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgp_sym_encrypt_text"("plaintext" "text", "passphrase" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."respond_to_offer"("token_arg" "text", "status_arg" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."respond_to_offer"("token_arg" "text", "status_arg" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_offer"("token_arg" "text", "status_arg" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."training_adjustments_event_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."training_adjustments_event_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."training_adjustments_event_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."training_records_event_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."training_records_event_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."training_records_event_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."ai_cache" TO "anon";
GRANT ALL ON TABLE "public"."ai_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_cache" TO "service_role";



GRANT ALL ON TABLE "public"."ai_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_logs" TO "service_role";



GRANT ALL ON TABLE "public"."applicants" TO "anon";
GRANT ALL ON TABLE "public"."applicants" TO "authenticated";
GRANT ALL ON TABLE "public"."applicants" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."integration_log" TO "anon";
GRANT ALL ON TABLE "public"."integration_log" TO "authenticated";
GRANT ALL ON TABLE "public"."integration_log" TO "service_role";



GRANT ALL ON TABLE "public"."offers" TO "anon";
GRANT ALL ON TABLE "public"."offers" TO "authenticated";
GRANT ALL ON TABLE "public"."offers" TO "service_role";



GRANT ALL ON TABLE "public"."people" TO "anon";
GRANT ALL ON TABLE "public"."people" TO "authenticated";
GRANT ALL ON TABLE "public"."people" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_settings" TO "anon";
GRANT ALL ON TABLE "public"."tenant_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_settings" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_users" TO "anon";
GRANT ALL ON TABLE "public"."tenant_users" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_users" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."training_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."training_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."training_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."training_events" TO "anon";
GRANT ALL ON TABLE "public"."training_events" TO "authenticated";
GRANT ALL ON TABLE "public"."training_events" TO "service_role";



GRANT ALL ON TABLE "public"."training_records" TO "anon";
GRANT ALL ON TABLE "public"."training_records" TO "authenticated";
GRANT ALL ON TABLE "public"."training_records" TO "service_role";



GRANT ALL ON TABLE "public"."v_training_compliance" TO "anon";
GRANT ALL ON TABLE "public"."v_training_compliance" TO "authenticated";
GRANT ALL ON TABLE "public"."v_training_compliance" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







