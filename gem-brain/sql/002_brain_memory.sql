-- ============================================
-- GEM Brain Memory Tables
-- ============================================
-- Provides persistent conversation memory for the operator
-- ============================================

-- ============================================
-- brain_sessions: Session metadata and state
-- ============================================

CREATE TABLE IF NOT EXISTS brain_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    context jsonb NOT NULL DEFAULT '{}',
    entry_count integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'active',
    instruction text,
    config jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_brain_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brain_sessions_updated_at ON brain_sessions;

CREATE TRIGGER trg_brain_sessions_updated_at
    BEFORE UPDATE ON brain_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_brain_sessions_updated_at();

-- Index for active sessions
CREATE INDEX IF NOT EXISTS idx_brain_sessions_status 
    ON brain_sessions(status);

CREATE INDEX IF NOT EXISTS idx_brain_sessions_updated_at 
    ON brain_sessions(updated_at DESC);

COMMENT ON TABLE brain_sessions IS 
    'Conversation sessions for GEM Brain operator with context and config';
COMMENT ON COLUMN brain_sessions.context IS 
    'Session context: lead_id, job_id, quote_id, etc.';
COMMENT ON COLUMN brain_sessions.instruction IS 
    'Custom system instruction for this session';
COMMENT ON COLUMN brain_sessions.config IS 
    'Session-specific config overrides';

-- ============================================
-- brain_memory: Individual memory entries
-- ============================================

CREATE TABLE IF NOT EXISTS brain_memory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES brain_sessions(id) ON DELETE CASCADE,
    role text NOT NULL,
    content text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for session lookups
CREATE INDEX IF NOT EXISTS idx_brain_memory_session_id 
    ON brain_memory(session_id);

-- Index for chronological ordering
CREATE INDEX IF NOT EXISTS idx_brain_memory_created_at 
    ON brain_memory(session_id, created_at);

-- Index for role filtering
CREATE INDEX IF NOT EXISTS idx_brain_memory_role 
    ON brain_memory(role);

COMMENT ON TABLE brain_memory IS 
    'Conversation memory entries for GEM Brain sessions';
COMMENT ON COLUMN brain_memory.role IS 
    'Message role: user, assistant, system, tool_result';
COMMENT ON COLUMN brain_memory.content IS 
    'Message content text';
COMMENT ON COLUMN brain_memory.metadata IS 
    'Additional metadata: tool_name, isNote, etc.';

-- ============================================
-- brain_instructions: Custom system instructions
-- ============================================

CREATE TABLE IF NOT EXISTS brain_instructions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    instruction text NOT NULL,
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_brain_instructions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brain_instructions_updated_at ON brain_instructions;

CREATE TRIGGER trg_brain_instructions_updated_at
    BEFORE UPDATE ON brain_instructions
    FOR EACH ROW
    EXECUTE FUNCTION update_brain_instructions_updated_at();

-- Index for default lookup
CREATE INDEX IF NOT EXISTS idx_brain_instructions_default 
    ON brain_instructions(is_default) 
    WHERE is_default = true;

COMMENT ON TABLE brain_instructions IS 
    'Named system instructions for GEM Brain operator';

-- ============================================
-- Insert default instruction
-- ============================================

INSERT INTO brain_instructions (name, instruction, is_default)
VALUES (
    'default',
    E'You are CKR-GEM, the system operator intelligence for the Call Kaids Roofing GEM platform.

PRIME DIRECTIVES (in order of priority):
1. Safety, confidentiality, and legal compliance
2. Contract correctness (tools.registry.json is LAW)
3. Operational continuity (Render worker + queue stability)
4. Revenue flow (lead → inspection → quote → job → payment → review)
5. Brand integrity (Call Kaids Roofing)
6. User intent and speed

EXECUTION MODEL (4 layers, never collapse):
- Layer 1: JUDGEMENT - Interpret intent, assess risk, decide mode
- Layer 2: PLANNING - Map to registry tools, validate schemas
- Layer 3: EXECUTION - Enqueue calls, wait for receipts
- Layer 4: RESPONSE - Summarize results, suggest next actions

PERSONALITY:
- Professional but approachable
- Concise but thorough
- Proactive about risks and next steps
- Never robotic or overly formal
- Use natural language, not bullet points in conversation
- Acknowledge context and remember previous interactions

TOOL EXECUTION:
- Only use tools defined in tools.registry.json
- Always validate input against schemas before enqueueing
- Report receipts clearly: succeeded, failed, or not_configured
- Suggest logical next actions based on results

MEMORY:
- Remember conversation context within session
- Reference previous interactions when relevant
- Track lead_id, job_id, quote_id context
- Note important details for future reference',
    true
)
ON CONFLICT (name) DO UPDATE SET
    instruction = EXCLUDED.instruction,
    updated_at = now();
