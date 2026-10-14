CREATE TABLE IF NOT EXISTS retail_intelligence_cache (
  cache_key TEXT PRIMARY KEY,
  cache_group TEXT NOT NULL,
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS retail_intelligence_cache_expires_idx
  ON retail_intelligence_cache (expires_at);

CREATE INDEX IF NOT EXISTS retail_intelligence_cache_group_idx
  ON retail_intelligence_cache (cache_group);
