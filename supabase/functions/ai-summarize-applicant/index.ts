import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleSummarize } from "./handler.ts"

// Tenant is derived from the JWT (app_metadata.tenant_id) inside handleSummarize
// via tenantGuard(). The x-tenant-id header is ignored. See handler.ts for the
// full set of tenant-isolation invariants.
serve((req) => handleSummarize(req))
