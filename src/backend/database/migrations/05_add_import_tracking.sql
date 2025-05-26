-- Add import tracking metadata to contacts
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS import_source VARCHAR(50),
ADD COLUMN IF NOT EXISTS import_batch_id UUID,
ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

-- Add import history table
CREATE TABLE IF NOT EXISTS import_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  source VARCHAR(50) NOT NULL,
  file_name VARCHAR(255),
  total_contacts INTEGER NOT NULL,
  successful_imports INTEGER NOT NULL,
  failed_imports INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL,
  error_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Add RLS policy for import_history table
ALTER TABLE import_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_history_user_isolation
ON import_history
USING (user_id = auth.uid());

-- Add OAuth tokens storage
CREATE TABLE IF NOT EXISTS oauth_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  provider VARCHAR(50) NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type VARCHAR(50),
  expires_at TIMESTAMPTZ,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Add RLS policies for OAuth connections
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY oauth_connections_user_isolation
ON oauth_connections
USING (user_id = auth.uid());