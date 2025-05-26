-- Add columns for progressive blocking system to rate_limit_attempts table
ALTER TABLE rate_limit_attempts ADD COLUMN IF NOT EXISTS block_count INTEGER DEFAULT 0;
ALTER TABLE rate_limit_attempts ADD COLUMN IF NOT EXISTS last_blocked TIMESTAMP;

-- Update index to include block_count for efficient querying
CREATE INDEX IF NOT EXISTS idx_rate_limit_block_status 
ON rate_limit_attempts(identifier, endpoint, block_count, blocked_until);

-- Add comment to describe the progressive blocking system
COMMENT ON COLUMN rate_limit_attempts.block_count IS 'Number of times this identifier has been blocked. Resets after 24 hours or max blocks reached.';
COMMENT ON COLUMN rate_limit_attempts.last_blocked IS 'Timestamp of when the identifier was last blocked. Used to reset block_count after 24 hours.';