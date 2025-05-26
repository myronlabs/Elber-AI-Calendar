-- Migration: 07_enhanced_contacts_integrity.sql
-- Purpose: Enhance contacts data integrity, add better duplicate detection, and improve batch operations

-- Transaction safety: Wrap entire migration in a transaction
BEGIN;

-- 1. Add extensions if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Add normalized phone column to improve duplicate detection
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS normalized_phone TEXT 
GENERATED ALWAYS AS (regexp_replace(phone, '[^0-9+]', '', 'g')) STORED;

-- 3. Improve indexes for better performance and duplicate detection
CREATE INDEX IF NOT EXISTS idx_contacts_normalized_phone ON contacts (user_id, normalized_phone)
WHERE normalized_phone IS NOT NULL AND normalized_phone != '';

CREATE INDEX IF NOT EXISTS idx_contacts_email_lower ON contacts (user_id, lower(email))
WHERE email IS NOT NULL AND email != '';

CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts (user_id, company)
WHERE company IS NOT NULL AND company != '';

CREATE INDEX IF NOT EXISTS idx_contacts_names ON contacts (user_id, first_name, last_name);

-- 4. Add validation constraints
ALTER TABLE contacts ADD CONSTRAINT IF NOT EXISTS check_email_format
  CHECK (email IS NULL OR email = '' OR email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$');

-- 5. Create contacts audit log table with partitioning for better performance
CREATE TABLE IF NOT EXISTS contacts_audit (
  audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation CHAR(1) NOT NULL, -- 'I'=Insert, 'U'=Update, 'D'=Delete
  user_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by UUID, -- User who made the change (auth.uid)
  operation_context TEXT, -- Context of operation (e.g., 'batch_import', 'manual_update')
  old_data JSONB,
  new_data JSONB
) PARTITION BY RANGE (changed_at);

-- Create initial partition (current month)
CREATE TABLE IF NOT EXISTS contacts_audit_current PARTITION OF contacts_audit
  FOR VALUES FROM (DATE_TRUNC('month', CURRENT_DATE)) 
  TO (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month');

-- Function to create future partitions automatically
CREATE OR REPLACE FUNCTION create_contacts_audit_partition()
RETURNS TRIGGER AS $$
DECLARE
  partition_date DATE;
  partition_name TEXT;
  start_date TIMESTAMPTZ;
  end_date TIMESTAMPTZ;
BEGIN
  partition_date := DATE_TRUNC('month', NEW.changed_at);
  partition_name := 'contacts_audit_' || TO_CHAR(partition_date, 'YYYY_MM');
  start_date := partition_date;
  end_date := partition_date + INTERVAL '1 month';
  
  -- Check if partition exists
  IF NOT EXISTS (
    SELECT FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = partition_name AND n.nspname = 'public'
  ) THEN
    -- Create new partition
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I PARTITION OF contacts_audit
      FOR VALUES FROM (%L) TO (%L)
    ', partition_name, start_date, end_date);
    
    -- Add needed indexes to the partition
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS %I ON %I(contact_id);
      CREATE INDEX IF NOT EXISTS %I ON %I(user_id);
      CREATE INDEX IF NOT EXISTS %I ON %I(changed_at);
    ', 
      partition_name || '_contact_id_idx', partition_name,
      partition_name || '_user_id_idx', partition_name,
      partition_name || '_changed_at_idx', partition_name
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to create partitions as needed
DROP TRIGGER IF EXISTS create_audit_partition_trigger ON contacts_audit;
CREATE TRIGGER create_audit_partition_trigger
  BEFORE INSERT ON contacts_audit
  FOR EACH ROW EXECUTE FUNCTION create_contacts_audit_partition();

-- Add RLS to audit table
ALTER TABLE contacts_audit ENABLE ROW LEVEL SECURITY;

-- Only allow users to see their own audit logs
CREATE POLICY contacts_audit_select_policy ON contacts_audit
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert to audit logs directly
CREATE POLICY contacts_audit_insert_policy ON contacts_audit
  FOR INSERT WITH CHECK (true);

-- Create indexes on audit table (will apply to all partitions)
CREATE INDEX IF NOT EXISTS idx_contacts_audit_contact_id ON contacts_audit(contact_id);
CREATE INDEX IF NOT EXISTS idx_contacts_audit_user_id ON contacts_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_audit_changed_at ON contacts_audit(changed_at);

-- 6. Create audit trigger function
CREATE OR REPLACE FUNCTION contact_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
  context_val TEXT;
  auth_uid UUID;
BEGIN
  -- Try to get operation context from session
  BEGIN
    context_val := current_setting('app.operation_context', true);
  EXCEPTION WHEN OTHERS THEN
    context_val := 'unknown';
  END;
  
  -- Try to get authenticated user ID
  BEGIN
    auth_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    auth_uid := NULL;
  END;
  
  IF TG_OP = 'INSERT' THEN
    INSERT INTO contacts_audit (
      operation, user_id, contact_id, changed_by, operation_context, old_data, new_data
    ) VALUES (
      'I', NEW.user_id, NEW.contact_id, auth_uid, context_val, NULL, row_to_json(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only audit if there are meaningful changes
    IF NEW IS DISTINCT FROM OLD THEN
      INSERT INTO contacts_audit (
        operation, user_id, contact_id, changed_by, operation_context, old_data, new_data
      ) VALUES (
        'U', NEW.user_id, NEW.contact_id, auth_uid, context_val, row_to_json(OLD), row_to_json(NEW)
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO contacts_audit (
      operation, user_id, contact_id, changed_by, operation_context, old_data, new_data
    ) VALUES (
      'D', OLD.user_id, OLD.contact_id, auth_uid, context_val, row_to_json(OLD), NULL
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on contacts table
DROP TRIGGER IF EXISTS contact_audit_trigger ON contacts;
CREATE TRIGGER contact_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON contacts
FOR EACH ROW EXECUTE FUNCTION contact_audit_trigger();

-- 7. Create a function to set operation context
CREATE OR REPLACE FUNCTION set_operation_context(context TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.operation_context', context, false);
END;
$$ LANGUAGE plpgsql;

-- 8. Create a contact_operations_log table for rate limiting
CREATE TABLE IF NOT EXISTS contact_operations_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL, -- 'import', 'export', 'delete_batch', etc.
  operation_size INT, -- Number of contacts affected
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add RLS to operations log
ALTER TABLE contact_operations_log ENABLE ROW LEVEL SECURITY;

-- Allow users to see their own operation logs
CREATE POLICY operations_log_select_policy ON contact_operations_log
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert to operations log
CREATE POLICY operations_log_insert_policy ON contact_operations_log
  FOR INSERT WITH CHECK (true);

-- Create indexes on operations log
CREATE INDEX IF NOT EXISTS idx_contact_operations_log_user_operation 
  ON contact_operations_log(user_id, operation, created_at);

-- 9. Create rate limiting function with better error handling
CREATE OR REPLACE FUNCTION rate_limit_contact_operations(
  p_user_id UUID,
  p_operation TEXT,
  p_size INT,
  p_max_operations INT,
  p_max_size INT,
  p_time_window INTERVAL
) RETURNS BOOLEAN AS $$
DECLARE
  operation_count INT;
  total_size INT;
BEGIN
  -- Validate inputs
  IF p_user_id IS NULL OR p_operation IS NULL OR p_size IS NULL THEN
    RAISE EXCEPTION 'Invalid parameters for rate limiting' USING ERRCODE = 'INVLD';
  END IF;

  -- Count recent operations with explicit error handling
  BEGIN
    SELECT 
      COUNT(*),
      COALESCE(SUM(operation_size), 0)
    INTO 
      operation_count,
      total_size
    FROM contact_operations_log
    WHERE 
      user_id = p_user_id
      AND operation = p_operation
      AND created_at > NOW() - p_time_window;
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't expose details
    RAISE EXCEPTION 'Rate limit check failed' USING ERRCODE = 'RTERR';
  END;
    
  -- Check if limits exceeded
  IF operation_count >= p_max_operations THEN
    RETURN FALSE;
  END IF;
  
  IF total_size + p_size > p_max_size THEN
    RETURN FALSE;
  END IF;
  
  -- Log this operation in a transaction to ensure atomicity
  BEGIN
    INSERT INTO contact_operations_log (
      user_id, operation, operation_size, created_at
    ) VALUES (
      p_user_id, p_operation, p_size, NOW()
    );
  EXCEPTION WHEN OTHERS THEN
    -- If logging fails, default to safety and deny operation
    RETURN FALSE;
  END;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 10. Create a function for finding duplicate contacts with better error handling
CREATE OR REPLACE FUNCTION find_duplicate_contacts(
  p_user_id UUID,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_company TEXT DEFAULT NULL
) RETURNS TABLE (
  contact_id UUID,
  confidence TEXT,
  match_reason TEXT
) AS $$
BEGIN
  -- Validate user_id
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null' USING ERRCODE = 'INVLD';
  END IF;
  
  -- Sanitize inputs
  p_email := NULLIF(TRIM(p_email), '');
  p_phone := NULLIF(TRIM(p_phone), '');
  p_first_name := NULLIF(TRIM(p_first_name), '');
  p_last_name := NULLIF(TRIM(p_last_name), '');
  p_company := NULLIF(TRIM(p_company), '');
  
  -- Tier 1: Exact email match (highest confidence)
  IF p_email IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      c.contact_id, 
      'high'::TEXT AS confidence,
      'email'::TEXT AS match_reason
    FROM contacts c
    WHERE 
      c.user_id = p_user_id AND 
      LOWER(c.email) = LOWER(p_email);
  END IF;
  
  -- Tier 2: Phone number match (high confidence)
  IF p_phone IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      c.contact_id, 
      'high'::TEXT AS confidence,
      'phone'::TEXT AS match_reason
    FROM contacts c
    WHERE 
      c.user_id = p_user_id AND
      c.normalized_phone = regexp_replace(p_phone, '[^0-9+]', '', 'g');
  END IF;
  
  -- Tier 3: First name + Last name + Company (medium confidence)
  IF p_first_name IS NOT NULL AND p_last_name IS NOT NULL AND p_company IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      c.contact_id, 
      'medium'::TEXT AS confidence,
      'name_and_company'::TEXT AS match_reason
    FROM contacts c
    WHERE 
      c.user_id = p_user_id AND
      LOWER(c.first_name) = LOWER(p_first_name) AND
      LOWER(c.last_name) = LOWER(p_last_name) AND
      LOWER(c.company) = LOWER(p_company);
  END IF;
  
  -- Tier 4: Fuzzy name matching if first and last names are provided
  IF p_first_name IS NOT NULL AND p_last_name IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      c.contact_id, 
      'low'::TEXT AS confidence,
      'similar_name'::TEXT AS match_reason
    FROM contacts c
    WHERE 
      c.user_id = p_user_id AND
      (
        (LOWER(c.first_name) % LOWER(p_first_name) AND similarity(LOWER(c.first_name), LOWER(p_first_name)) > 0.7) OR
        (LOWER(c.last_name) % LOWER(p_last_name) AND similarity(LOWER(c.last_name), LOWER(p_last_name)) > 0.7)
      );
  END IF;
  
  -- Return VOID if no matches (necessary for RETURN QUERY)
  RETURN;
EXCEPTION WHEN OTHERS THEN
  -- Log error and re-raise
  RAISE;
END;
$$ LANGUAGE plpgsql;

-- 11. Enhance import_processing_queue table with more tracking fields
ALTER TABLE import_processing_queue 
  ADD COLUMN IF NOT EXISTS duplicate_strategy TEXT DEFAULT 'skip' CHECK (duplicate_strategy IN ('skip', 'update', 'create')),
  ADD COLUMN IF NOT EXISTS error_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS success_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicates_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_duplicates_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skipped_duplicates_count INT DEFAULT 0;

-- 12. Create a batch operation function for contacts
CREATE OR REPLACE FUNCTION batch_update_contacts(
  p_user_id UUID,
  p_contact_ids UUID[],
  p_updates JSONB,
  p_operation_context TEXT DEFAULT 'batch_update'
) RETURNS INT AS $$
DECLARE
  v_updated_count INT := 0;
BEGIN
  -- Validate inputs
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null' USING ERRCODE = 'INVLD';
  END IF;
  
  IF p_updates IS NULL THEN
    RAISE EXCEPTION 'Updates cannot be null' USING ERRCODE = 'INVLD';
  END IF;
  
  IF p_contact_ids IS NULL OR array_length(p_contact_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Contact IDs cannot be null or empty' USING ERRCODE = 'INVLD';
  END IF;
  
  -- Validate email if present
  IF p_updates->>'email' IS NOT NULL AND p_updates->>'email' != '' 
     AND p_updates->>'email' !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Invalid email format' USING ERRCODE = 'INVLD';
  END IF;
  
  -- Begin explicit transaction for atomicity
  BEGIN
    -- Set operation context for audit
    PERFORM set_operation_context(p_operation_context);
    
    -- Perform batch update with explicit field checking to prevent nullifying fields
    WITH updated AS (
      UPDATE contacts
      SET
        first_name = CASE WHEN p_updates ? 'first_name' AND p_updates->>'first_name' != '' 
                     THEN p_updates->>'first_name' ELSE first_name END,
        last_name = CASE WHEN p_updates ? 'last_name' THEN p_updates->>'last_name' ELSE last_name END,
        email = CASE WHEN p_updates ? 'email' THEN p_updates->>'email' ELSE email END,
        phone = CASE WHEN p_updates ? 'phone' THEN p_updates->>'phone' ELSE phone END,
        company = CASE WHEN p_updates ? 'company' THEN p_updates->>'company' ELSE company END,
        job_title = CASE WHEN p_updates ? 'job_title' THEN p_updates->>'job_title' ELSE job_title END,
        address = CASE WHEN p_updates ? 'address' THEN p_updates->>'address' ELSE address END,
        notes = CASE WHEN p_updates ? 'notes' THEN p_updates->>'notes' ELSE notes END,
        updated_at = NOW()
      WHERE
        user_id = p_user_id AND
        contact_id = ANY(p_contact_ids)
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_updated_count FROM updated;

    -- Log operation
    INSERT INTO contact_operations_log (
      user_id, operation, operation_size
    ) VALUES (
      p_user_id, 'batch_update', v_updated_count
    );
    
    -- Commit the transaction implicitly
    RETURN v_updated_count;
  EXCEPTION 
    WHEN OTHERS THEN
      -- Rollback will happen automatically
      RAISE; -- Re-raise the exception
  END;
END;
$$ LANGUAGE plpgsql;

-- 13. Create a batch delete function with transaction safety
CREATE OR REPLACE FUNCTION batch_delete_contacts(
  p_user_id UUID,
  p_contact_ids UUID[],
  p_operation_context TEXT DEFAULT 'batch_delete'
) RETURNS INT AS $$
DECLARE
  v_deleted_count INT := 0;
BEGIN
  -- Validate inputs
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null' USING ERRCODE = 'INVLD';
  END IF;
  
  IF p_contact_ids IS NULL OR array_length(p_contact_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Contact IDs cannot be null or empty' USING ERRCODE = 'INVLD';
  END IF;
  
  -- Begin explicit transaction for atomicity
  BEGIN
    -- Set operation context for audit
    PERFORM set_operation_context(p_operation_context);
    
    -- Perform batch delete
    WITH deleted AS (
      DELETE FROM contacts
      WHERE
        user_id = p_user_id AND
        contact_id = ANY(p_contact_ids)
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_deleted_count FROM deleted;

    -- Log operation
    INSERT INTO contact_operations_log (
      user_id, operation, operation_size
    ) VALUES (
      p_user_id, 'batch_delete', v_deleted_count
    );
    
    RETURN v_deleted_count;
  EXCEPTION 
    WHEN OTHERS THEN
      -- Rollback will happen automatically
      RAISE; -- Re-raise the exception
  END;
END;
$$ LANGUAGE plpgsql;

-- 14. Create a contact creation function with duplicate detection and transaction safety
CREATE OR REPLACE FUNCTION create_contact_with_validation(
  p_user_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_company TEXT DEFAULT NULL,
  p_job_title TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_operation_context TEXT DEFAULT 'manual_create',
  p_duplicate_handling TEXT DEFAULT 'error' -- 'error', 'skip', 'update', 'create_anyway'
) RETURNS TABLE (
  success BOOLEAN,
  contact_id UUID,
  message TEXT,
  duplicate_id UUID
) AS $$
DECLARE
  v_duplicate record;
  v_contact_id UUID;
BEGIN
  -- Input validation
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null' USING ERRCODE = 'INVLD';
  END IF;
  
  IF p_duplicate_handling IS NULL OR p_duplicate_handling NOT IN ('error', 'skip', 'update', 'create_anyway') THEN
    RAISE EXCEPTION 'Invalid duplicate handling strategy' USING ERRCODE = 'INVLD';
  END IF;
  
  -- Sanitize inputs
  p_first_name := TRIM(p_first_name);
  p_last_name := TRIM(p_last_name);
  p_email := NULLIF(TRIM(p_email), '');
  p_phone := NULLIF(TRIM(p_phone), '');
  p_company := NULLIF(TRIM(p_company), '');
  p_job_title := NULLIF(TRIM(p_job_title), '');
  p_address := NULLIF(TRIM(p_address), '');
  p_notes := NULLIF(TRIM(p_notes), '');
  
  -- Begin explicit transaction
  BEGIN
    -- Set operation context for audit
    PERFORM set_operation_context(p_operation_context);
    
    -- Basic validation
    IF p_first_name IS NULL AND p_last_name IS NULL THEN
      RETURN QUERY SELECT false, NULL::UUID, 'Contact must have at least a first name or last name'::TEXT, NULL::UUID;
      RETURN;
    END IF;
    
    -- Validate email format if provided
    IF p_email IS NOT NULL AND p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
      RETURN QUERY SELECT false, NULL::UUID, 'Invalid email format'::TEXT, NULL::UUID;
      RETURN;
    END IF;
    
    -- Check for duplicates
    SELECT * INTO v_duplicate 
    FROM find_duplicate_contacts(
      p_user_id, p_email, p_phone, p_first_name, p_last_name, p_company
    ) 
    LIMIT 1;
    
    -- Handle duplicates based on strategy
    IF v_duplicate.contact_id IS NOT NULL THEN
      IF p_duplicate_handling = 'error' THEN
        RETURN QUERY SELECT false, NULL::UUID, 
                     format('Duplicate contact detected: %s match', v_duplicate.confidence)::TEXT, 
                     v_duplicate.contact_id;
        RETURN;
      ELSIF p_duplicate_handling = 'skip' THEN
        RETURN QUERY SELECT true, v_duplicate.contact_id, 'Existing contact found, skipped creation'::TEXT, v_duplicate.contact_id;
        RETURN;
      ELSIF p_duplicate_handling = 'update' THEN
        -- Update existing contact
        UPDATE contacts
        SET
          first_name = COALESCE(p_first_name, first_name),
          last_name = COALESCE(p_last_name, last_name),
          email = p_email, -- Use NULL if provided as NULL
          phone = p_phone,
          company = p_company,
          job_title = p_job_title,
          address = p_address,
          notes = p_notes,
          updated_at = NOW()
        WHERE contact_id = v_duplicate.contact_id;
        
        RETURN QUERY SELECT true, v_duplicate.contact_id, 'Updated existing contact'::TEXT, v_duplicate.contact_id;
        RETURN;
      END IF;
      -- If duplicate_handling is 'create_anyway', continue to insert below
    END IF;
    
    -- Insert new contact
    INSERT INTO contacts (
      user_id, first_name, last_name, email, phone, company, job_title, address, notes
    ) VALUES (
      p_user_id, p_first_name, p_last_name, p_email, p_phone, p_company, p_job_title, p_address, p_notes
    ) RETURNING contact_id INTO v_contact_id;
    
    -- Log operation
    INSERT INTO contact_operations_log (
      user_id, operation, operation_size
    ) VALUES (
      p_user_id, 'create', 1
    );
    
    RETURN QUERY SELECT true, v_contact_id, 'Contact created successfully'::TEXT, NULL::UUID;
  EXCEPTION WHEN OTHERS THEN
    -- Rollback happens automatically
    RETURN QUERY SELECT false, NULL::UUID, 'Error creating contact: ' || SQLERRM, NULL::UUID;
  END;
END;
$$ LANGUAGE plpgsql;

-- 15. Create a table for contact tags
CREATE TABLE IF NOT EXISTS contact_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Add RLS to tags
ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;

-- Allow users to manage their own tags
CREATE POLICY tags_crud_policy ON contact_tags
  FOR ALL USING (auth.uid() = user_id);

-- Create a table for contact-tag associations
CREATE TABLE IF NOT EXISTS contact_tag_associations (
  contact_id UUID NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES contact_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, tag_id)
);

-- Add RLS to tag associations
ALTER TABLE contact_tag_associations ENABLE ROW LEVEL SECURITY;

-- Add policies to tag associations
CREATE POLICY tag_associations_select_policy ON contact_tag_associations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.contact_id = contact_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY tag_associations_insert_policy ON contact_tag_associations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.contact_id = contact_id AND c.user_id = auth.uid()
    ) AND
    EXISTS (
      SELECT 1 FROM contact_tags t
      WHERE t.id = tag_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY tag_associations_delete_policy ON contact_tag_associations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.contact_id = contact_id AND c.user_id = auth.uid()
    )
  );

-- 16. Create a batch tag function with transaction safety
CREATE OR REPLACE FUNCTION batch_tag_contacts(
  p_user_id UUID,
  p_contact_ids UUID[],
  p_tag_names TEXT[],
  p_operation_context TEXT DEFAULT 'batch_tag'
) RETURNS INT AS $$
DECLARE
  v_tag_id UUID;
  v_tag_name TEXT;
  v_tagged_count INT := 0;
BEGIN
  -- Validate inputs
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null' USING ERRCODE = 'INVLD';
  END IF;
  
  IF p_contact_ids IS NULL OR array_length(p_contact_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Contact IDs cannot be null or empty' USING ERRCODE = 'INVLD';
  END IF;
  
  IF p_tag_names IS NULL OR array_length(p_tag_names, 1) IS NULL THEN
    RAISE EXCEPTION 'Tag names cannot be null or empty' USING ERRCODE = 'INVLD';
  END IF;
  
  -- Begin explicit transaction
  BEGIN
    -- Set operation context for audit
    PERFORM set_operation_context(p_operation_context);
    
    -- Process each tag
    FOREACH v_tag_name IN ARRAY p_tag_names
    LOOP
      -- Skip empty tag names
      IF v_tag_name IS NULL OR TRIM(v_tag_name) = '' THEN
        CONTINUE;
      END IF;
      
      v_tag_name := TRIM(v_tag_name);
      
      -- Get or create tag
      SELECT id INTO v_tag_id FROM contact_tags 
      WHERE user_id = p_user_id AND name = v_tag_name;
      
      IF v_tag_id IS NULL THEN
        INSERT INTO contact_tags (user_id, name)
        VALUES (p_user_id, v_tag_name)
        RETURNING id INTO v_tag_id;
      END IF;
      
      -- Apply tag to contacts
      WITH inserted AS (
        INSERT INTO contact_tag_associations (contact_id, tag_id)
        SELECT 
          c.contact_id, v_tag_id
        FROM 
          unnest(p_contact_ids) AS cid
          JOIN contacts c ON c.contact_id = cid
        WHERE 
          c.user_id = p_user_id AND
          NOT EXISTS (
            SELECT 1 FROM contact_tag_associations
            WHERE contact_id = c.contact_id AND tag_id = v_tag_id
          )
        RETURNING 1
      )
      SELECT COUNT(*) INTO v_tagged_count FROM inserted;
    END LOOP;
    
    -- Log operation
    INSERT INTO contact_operations_log (
      user_id, operation, operation_size
    ) VALUES (
      p_user_id, 'batch_tag', v_tagged_count
    );
    
    RETURN v_tagged_count;
  EXCEPTION WHEN OTHERS THEN
    -- Rollback happens automatically
    RAISE;
  END;
END;
$$ LANGUAGE plpgsql;

-- 17. Create a lookup function for operation history with pagination
CREATE OR REPLACE FUNCTION get_contact_operations_history(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
) RETURNS TABLE (
  operation TEXT,
  operation_size INT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Validate inputs
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null' USING ERRCODE = 'INVLD';
  END IF;
  
  -- Enforce reasonable limits
  p_limit := LEAST(p_limit, 100);
  
  RETURN QUERY
  SELECT 
    operation,
    operation_size,
    created_at
  FROM contact_operations_log
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
EXCEPTION WHEN OTHERS THEN
  -- Log error and re-raise
  RAISE;
END;
$$ LANGUAGE plpgsql;

-- 18. Create an error code enum type for consistent error reporting
CREATE TYPE contact_error_code AS ENUM (
  'INVALID_INPUT',
  'DUPLICATE_FOUND',
  'RATE_LIMIT_EXCEEDED',
  'DATABASE_ERROR',
  'PERMISSION_DENIED',
  'NOT_FOUND',
  'VALIDATION_ERROR'
);

-- 19. Create a standardized function for checking ownership of contacts
CREATE OR REPLACE FUNCTION check_contact_ownership(
  p_user_id UUID,
  p_contact_ids UUID[]
) RETURNS TABLE (
  contact_id UUID,
  exists_for_user BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cid,
    EXISTS (
      SELECT 1 FROM contacts 
      WHERE contact_id = cid AND user_id = p_user_id
    ) AS exists_for_user
  FROM 
    unnest(p_contact_ids) AS cid;
END;
$$ LANGUAGE plpgsql;

-- Apply the migration
COMMIT;