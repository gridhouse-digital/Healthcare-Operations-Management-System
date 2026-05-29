# Fix Duplicate Applicants in Supabase Database

## Problem Description

The applicants table has duplicate records when applicant information (especially email) is updated. Instead of updating the existing record, the system creates a new record with the same name but different email, treating it as a new applicant.

**Example Duplicate:**
- **Record 1 (Old)**: [Applicant A] - `old.email@example.com` - Status: "Hired" - ID: `[uuid-old]`
- **Record 2 (New)**: [Applicant A] - `new.email@example.com` - Status: "New" - ID: `[uuid-new]`

The correct record should be the "Hired" one since that person is already an employee, but the new email should be reflected.

## Root Cause

The JotForm integration uses **email as the unique identifier** for deduplication. When an applicant submits a form with a different email, it's treated as a completely new applicant rather than an update to an existing person.

## Solution Steps

### Step 1: Identify All Duplicates

Query to find duplicate applicants by name:

```sql
SELECT
    first_name,
    last_name,
    array_agg(id) as applicant_ids,
    array_agg(email) as emails,
    array_agg(status) as statuses,
    array_agg(created_at) as created_dates,
    count(*) as duplicate_count
FROM applicants
WHERE first_name IS NOT NULL
    AND last_name IS NOT NULL
GROUP BY LOWER(first_name), LOWER(last_name)
HAVING count(*) > 1
ORDER BY duplicate_count DESC;
```

### Step 2: Merge Duplicate Records

For each set of duplicates found, perform the following merge logic:

**Priority Rules (in order):**
1. Keep the record with status = "Hired" (highest priority - they're already an employee)
2. If no "Hired", keep the record with status = "Offer"
3. If neither, keep the record with the most recent `updated_at` timestamp
4. If tied, keep the record with the earliest `created_at` (original application)

**Data to Preserve:**
- Use the **most recent email** from any of the duplicate records
- Use the **most recent phone** from any of the duplicate records
- Keep the **highest priority status** (Hired > Offer > Interview > New)
- Preserve the **earliest created_at** date (when they first applied)
- Update the **updated_at** to current timestamp

### Step 3: Handle Related Records

Before deleting duplicate records, ensure related data is preserved:

1. **Check for employee record**:
   ```sql
   SELECT id, applicant_id FROM employees
   WHERE applicant_id IN (<duplicate_ids>);
   ```
   If an employee record exists, keep that applicant_id.

2. **Check for offers**:
   ```sql
   SELECT id, applicant_id FROM offers
   WHERE applicant_id IN (<duplicate_ids>);
   ```
   Update offer records to point to the primary applicant_id.

### Step 4: Merge Specific Duplicate (Savanna Mock)

**SQL Commands:**

```sql
-- 1. Update the "Hired" record with the new email
UPDATE applicants
SET
    email = 'new.email@example.com',
    updated_at = NOW()
WHERE id = '[uuid-old]';

-- 2. Verify no related records point to the duplicate
-- Check employees
SELECT * FROM employees WHERE applicant_id = '[uuid-new]';

-- Check offers
SELECT * FROM offers WHERE applicant_id = '[uuid-new]';

-- 3. If no related records exist, delete the duplicate
DELETE FROM applicants
WHERE id = '[uuid-new]';
```

### Step 5: Automated Script for All Duplicates

Create a script that:

1. Finds all duplicate applicants (by first_name + last_name)
2. For each duplicate set:
   - Determines the "primary" record (using priority rules)
   - Merges data from duplicates to primary
   - Updates any related records (employees, offers) to point to primary
   - Deletes the duplicate records

**Pseudocode:**

```typescript
// 1. Find duplicates
const duplicates = await supabase.rpc('find_duplicate_applicants');

for (const duplicateSet of duplicates) {
    // 2. Determine primary record
    const primary = determinePrimary(duplicateSet.applicant_ids);
    const duplicateIds = duplicateSet.applicant_ids.filter(id => id !== primary.id);

    // 3. Collect best data from all records
    const allRecords = await supabase
        .from('applicants')
        .select('*')
        .in('id', duplicateSet.applicant_ids);

    const mergedData = {
        email: getMostRecentEmail(allRecords),
        phone: getMostRecentPhone(allRecords),
        status: getHighestPriorityStatus(allRecords),
        created_at: getEarliestDate(allRecords.map(r => r.created_at)),
        updated_at: new Date().toISOString()
    };

    // 4. Update primary record with merged data
    await supabase
        .from('applicants')
        .update(mergedData)
        .eq('id', primary.id);

    // 5. Update related records
    await supabase
        .from('employees')
        .update({ applicant_id: primary.id })
        .in('applicant_id', duplicateIds);

    await supabase
        .from('offers')
        .update({ applicant_id: primary.id })
        .in('applicant_id', duplicateIds);

    // 6. Delete duplicates
    await supabase
        .from('applicants')
        .delete()
        .in('id', duplicateIds);
}
```

### Step 6: Prevention - Update JotForm Integration

**Current Issue**: The system uses email as the unique identifier in `listApplicants` and `jotform-webhook` functions.

**Fix Required**: Change the deduplication logic to use **name matching** (first_name + last_name) in addition to email:

```typescript
// In jotform-webhook Edge Function
const { data: existingApplicant } = await supabase
    .from('applicants')
    .select('*')
    .or(`email.eq.${email},and(first_name.ilike.${firstName},last_name.ilike.${lastName})`)
    .single();

if (existingApplicant) {
    // Update existing record instead of creating new one
    await supabase
        .from('applicants')
        .update({
            email: email, // Update with new email if changed
            phone: phone,
            updated_at: new Date().toISOString()
        })
        .eq('id', existingApplicant.id);
} else {
    // Create new record
}
```

## Execution Plan for AI with Supabase MCP Access

### Phase 1: Analysis
1. Run the duplicate detection query
2. Export results to CSV/JSON for review
3. Identify all duplicate sets and their relationships

### Phase 2: Manual Review (Important!)
⚠️ **Do NOT proceed without human approval** - Review the duplicate list with the user to confirm merge strategy

### Phase 3: Execution
1. Start with the known duplicate (Savanna Mock)
2. Process remaining duplicates one by one
3. Log all changes for audit trail

### Phase 4: Verification
1. Re-run duplicate detection query (should return 0 results)
2. Verify employee and offer relationships are intact
3. Verify status integrity (no "Hired" applicants lost)

### Phase 5: Prevention
Update the JotForm webhook function to use name-based matching

## Safety Checks

Before deleting any record, verify:
- ✅ No employee record points to it
- ✅ No offer record points to it
- ✅ Data has been merged to primary record
- ✅ User has approved the merge

## Rollback Plan

Before making any changes:
1. Export full applicants table to CSV backup
2. Export employees table to CSV backup
3. Export offers table to CSV backup

If issues occur, restore from backups using the exported CSVs.
