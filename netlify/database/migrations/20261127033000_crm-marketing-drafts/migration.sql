CREATE TABLE IF NOT EXISTS crm_marketing_draft (
 company TEXT NOT NULL, owner_id TEXT NOT NULL, draft_id UUID NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('campaign','journey','offer')),
 payload JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(company,owner_id,draft_id)
);
CREATE INDEX IF NOT EXISTS crm_marketing_draft_recent ON crm_marketing_draft(company,owner_id,updated_at DESC);
