-- Allow authenticated users to read AI logs and cache
-- This enables the AI Dashboard to work for logged-in users

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Service role full access logs" ON ai_logs;
DROP POLICY IF EXISTS "Service role full access cache" ON ai_cache;

-- Allow service role full access to ai_logs
CREATE POLICY "Service role full access logs" ON ai_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow authenticated users to read ai_logs
CREATE POLICY "Authenticated users can read logs" ON ai_logs
    FOR SELECT
    TO authenticated
    USING (true);

-- Allow service role to insert ai_logs
CREATE POLICY "Service role can insert logs" ON ai_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Allow service role full access to ai_cache
CREATE POLICY "Service role full access cache" ON ai_cache
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow authenticated users to read ai_cache
CREATE POLICY "Authenticated users can read cache" ON ai_cache
    FOR SELECT
    TO authenticated
    USING (true);
