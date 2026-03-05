# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Prolific HR - Command Centre is a full-stack HR management system for Prolific Homecare LLC. It integrates JotForm applications with Supabase backend and React frontend to manage the complete applicant-to-employee lifecycle.

**Tech Stack:**
- Frontend: React 19 + TypeScript + Vite + TailwindCSS + shadcn/ui
- Backend: Supabase (PostgreSQL + Edge Functions)
- External APIs: JotForm API, WordPress/LearnDash API
- AI Features: Claude API for applicant screening and offer letter generation

## Commands

### Development
```bash
cd prolific-hr-app
npm run dev          # Start development server (Vite)
npm run build        # TypeScript compilation + production build
npm run lint         # Run ESLint
npm run preview      # Preview production build
```

### Supabase Edge Functions
```bash
cd prolific-hr-app
supabase functions deploy <function-name>   # Deploy specific function
supabase functions list                      # List all functions
supabase functions logs <function-name>      # View function logs
```

### Database Migrations
```bash
cd prolific-hr-app
supabase db push              # Apply migrations to remote database
supabase db inspect tables    # Inspect database tables
supabase db inspect           # General database inspection
```

## High-Level Architecture

### Data Flow: Applicant Lifecycle

1. **Application Submission (Real-time)**
   - User submits JotForm → Webhook triggered → Edge Function (`jotform-webhook`) creates applicant record in < 5 seconds
   - Fallback: Manual sync via `listApplicants` function if webhook fails

2. **File Management**
   - Files uploaded to JotForm are automatically migrated to Supabase Storage (`resumes` bucket)
   - Original JotForm URLs kept as fallback, stored paths in database
   - Migration happens in both webhook handler and manual sync

3. **Data Retention**
   - Applicants older than 3 months (excluding "Hired" and "Offer" statuses) are archived daily at 2 AM
   - Archive tables: `applicants_archive`, `offers_archive` (admin-only access)
   - Scheduled via pg_cron extension (`cleanup-old-submissions` function)

4. **AI-Powered Features**
   - Applicant screening/ranking (`ai-rank-applicants`)
   - Resume summarization (`ai-summarize-applicant`)
   - Offer letter generation (`ai-draft-offer-letter`)
   - Onboarding checklist logic (`ai-onboarding-logic`)

### Frontend Architecture

**Feature-Based Structure:**
```
src/
├── features/              # Feature modules (domain-driven)
│   ├── applicants/       # Applicant list, details, AI ranking
│   ├── offers/           # Offer creation, public view, signing
│   ├── employees/        # Employee management
│   ├── auth/             # Login, password reset, protected routes
│   ├── dashboard/        # Dashboard with metrics
│   ├── admin/            # Admin-only features (AI logs, settings)
│   ├── profile/          # User profile management
│   └── settings/         # System settings
├── components/
│   ├── layout/           # MainLayout, Sidebar, TopBar
│   ├── shared/           # Reusable components
│   ├── ui/               # shadcn/ui components
│   ├── applicants/       # Applicant-specific components
│   └── ai/               # AI feature components
├── lib/                  # Utility functions (Supabase client, AI client)
├── hooks/                # Custom React hooks
├── services/             # API services
└── types/                # TypeScript type definitions
```

**Routing:**
- Uses React Router v7 with nested routes
- Protected routes require authentication (`ProtectedRoute` component)
- Admin-only routes check for `role: 'admin'` in profiles table
- Public route: `/offer/:token` for offer acceptance (no auth required)

### Backend Architecture

**Supabase Edge Functions:**

1. **JotForm Integration** (`_shared/jotform-client.ts`):
   - Centralized API client with exponential backoff retry (3 attempts)
   - Rate limit detection (HTTP 429) and automatic retry
   - All API calls logged to `ai_logs` table

2. **Real-Time Webhook** (`jotform-webhook`):
   - Handles POST from JotForm on form submission
   - Maps form fields to applicant schema
   - Email-based deduplication
   - Auto-migrates files to Supabase Storage

3. **Manual Sync** (`listApplicants`):
   - Fetches recent submissions from JotForm API
   - Email-based matching (prevents duplicates)
   - Preserves existing applicant status
   - Migrates files during sync

4. **Applicant Details** (`getApplicantDetails`):
   - Cross-form matching (emergency contacts, I-9, vaccination records)
   - Email-based filtering (reduces API calls by 60-90%)

5. **Data Cleanup** (`cleanup-old-submissions`):
   - Runs daily at 2 AM via pg_cron
   - Archives applicants >3 months old (except "Hired" and "Offer")
   - Preserves related offers in `offers_archive`
   - Zero data loss (archives before deletion)

6. **File Manager** (`_shared/file-manager.ts`):
   - Downloads files from JotForm CDN
   - Uploads to Supabase Storage (`resumes` bucket)
   - Generates signed URLs with configurable expiry

**Database Schema (Key Tables):**
- `applicants`: Main applicant records (jotform_id, email, status, resume_url)
- `applicants_archive`: Archived applicants (3-month retention policy)
- `offers`: Job offers linked to applicants (CASCADE delete)
- `offers_archive`: Archived offers
- `profiles`: User profiles with roles (admin, hr, employee)
- `ai_logs`: Centralized logging for AI/API calls
- Storage buckets: `resumes`, `compliance-documents` (private, RLS-protected)

### Key Design Patterns

1. **Email-Based Deduplication:**
   - Primary key: `id` (UUID)
   - Unique constraint on `email`
   - JotForm ID stored in `jotform_id` column
   - Prevents duplicate applicants across manual sync and webhooks

2. **Status Preservation:**
   - Manual sync never overwrites `status` field
   - HR changes (Rejected → Interview) persist during re-sync
   - Only new applicants get default "New" status

3. **File Migration Strategy:**
   - Check if URL contains "jotform.com" or "jotformcdn.com"
   - Migrate to Supabase Storage on first sync/webhook
   - Store path (not signed URL) in database
   - Regenerate signed URLs as needed (1 hour expiry by default)

4. **Centralized Logging:**
   - All JotForm API calls → `ai_logs` table
   - All AI API calls → `ai_logs` table
   - Includes metadata: duration, rate limits, error messages
   - Enables monitoring via admin dashboard

## Critical Implementation Notes

### When Working with Supabase Edge Functions

- Always use `jsr:@supabase/supabase-js@2` import (not npm)
- Service role key required for admin operations (RLS bypass)
- CORS headers required for all responses
- Use `Deno.env.get()` for environment variables

### When Working with JotForm Integration

- Never call JotForm API directly - use `JotFormClient` from `_shared/jotform-client.ts`
- Rate limits: 1,000 calls/month (monitor `limit-left` header)
- Email-based matching is the source of truth (not JotForm ID)
- Field mapping is in `mapSubmissionToApplicant()` function

### When Working with File Storage

- Never store signed URLs in database (regenerate on demand)
- Use `migrateFileToStorage()` for JotForm → Supabase migration
- Check `isJotFormFileUrl()` before attempting migration
- RLS policies require authentication for all storage operations

### When Working with Data Retention

- Never delete "Hired" or "Offer" status applicants
- Always archive before deletion (zero data loss)
- Test cleanup function with old test data before production
- Monitor `ai_logs` for cleanup job success/failure

### When Working with React Frontend

- Use `@/` alias for imports (configured in vite.config.ts)
- Supabase client initialized in `src/lib/supabase.ts` (export name: `supabase`) — NOT `supabaseClient.ts`
- React Query used for data fetching — custom hooks in `src/hooks/` wrap `useQuery`/`useMutation`
- Forms use react-hook-form + zod validation via `zodResolver(schema)`
- UI components from shadcn/ui (imported from `@/components/ui/`) — never modify these directly
- Conditional Tailwind classes: use `cn()` from `@/lib/utils` — never string concatenation
- ALL AI calls go through `aiClient` from `@/lib/aiClient` — never invoke AI Edge Functions directly
- User roles: `'admin' | 'hr' | 'staff'` — use `useUserRole()` hook (`isAdmin`, `isHR`, `isStaff` booleans)
- When calling `supabase.functions.invoke()`: check BOTH `error` (network) AND `data.error` (body)

## Environment Variables

**Frontend (.env):**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_WP_API_URL=
VITE_WP_USERNAME=
VITE_WP_APP_PASSWORD=
```

**Supabase Edge Functions (set via Supabase Dashboard):**
```
JOTFORM_API_KEY=
ANTHROPIC_API_KEY=
```

## Documentation References

For detailed implementation plans, deployment procedures, and troubleshooting:
- `DOCUMENTATION_INDEX.md` - Master index of all project documentation
- `PHASE_2_COMPLETION_SUMMARY.md` - Executive summary of Phase 2 features
- `PHASE_2_QUICK_REFERENCE.md` - Daily operations cheat sheet
- `DEPLOYMENT_CHECKLIST.md` - Step-by-step deployment guide
- `PHASE_2_VERIFICATION_GUIDE.md` - Testing and monitoring guide
- `JOTFORM_INTEGRATION_SUMMARY.md` - JotForm integration architecture
