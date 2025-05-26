-- Migration: 08_enhance_rls_with_email_confirmation.sql
-- Purpose: Enhance Row Level Security policies for all user tables to ensure they check for email confirmation

-- Start transaction for atomic changes
BEGIN;

-- ==========================================
-- ENHANCE EXISTING RLS POLICIES FOR IMPORT_HISTORY
-- ==========================================

-- Drop existing policies that don't check for email confirmation
DROP POLICY IF EXISTS import_history_user_isolation ON import_history;

-- Create enhanced policy that checks both user_id match AND email confirmation
CREATE POLICY "Users can access their own import history if email confirmed" 
ON import_history
FOR ALL
USING (
  user_id = auth.uid() AND 
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_custom_verified = true
  )
);

-- ==========================================
-- ENHANCE EXISTING RLS POLICIES FOR IMPORT_PROCESSING_QUEUE
-- ==========================================

-- Drop existing policies that don't check for email confirmation
DROP POLICY IF EXISTS "Users can see only their own import jobs" ON import_processing_queue;

-- Create enhanced policy that checks both user_id match AND email confirmation
CREATE POLICY "Users can see their own import jobs if email confirmed" 
ON import_processing_queue
FOR SELECT 
USING (
  auth.uid() = user_id AND 
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_custom_verified = true
  )
);

-- ==========================================
-- ENHANCE EXISTING RLS POLICIES FOR CONTACTS
-- ==========================================

-- Drop any existing policies for contacts that don't check email confirmation
DROP POLICY IF EXISTS contacts_user_isolation ON contacts;

-- Create enhanced policy that checks both user_id match AND email confirmation
CREATE POLICY "Users can manage their own contacts if email confirmed"
ON contacts
FOR ALL
USING (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_custom_verified = true
  )
);

-- ==========================================
-- ENHANCE EXISTING RLS POLICIES FOR CONVERSATION_HISTORY
-- ==========================================

-- Drop existing policy
DROP POLICY IF EXISTS "Users can manage their own conversation history" ON conversation_history;

-- Create enhanced policy that checks both user_id match AND email confirmation
CREATE POLICY "Users can manage their own conversation history if email confirmed"
ON conversation_history
FOR ALL
USING (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_custom_verified = true
  )
);

-- ==========================================
-- ENHANCE EXISTING RLS POLICIES FOR OAUTH_CONNECTIONS
-- ==========================================

-- Drop existing policy
DROP POLICY IF EXISTS oauth_connections_user_isolation ON oauth_connections;

-- Create enhanced policy that checks both user_id match AND email confirmation
CREATE POLICY "Users can manage their own OAuth connections if email confirmed"
ON oauth_connections
FOR ALL
USING (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_custom_verified = true
  )
);

-- ==========================================
-- ENHANCE EXISTING RLS POLICIES FOR CONTACT_TAGS
-- ==========================================

-- Drop existing policy
DROP POLICY IF EXISTS tags_crud_policy ON contact_tags;

-- Create enhanced policy that checks both user_id match AND email confirmation
CREATE POLICY "Users can manage their own tags if email confirmed"
ON contact_tags
FOR ALL
USING (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_custom_verified = true
  )
);

-- ==========================================
-- ENHANCE EXISTING RLS POLICIES FOR CONTACT_TAG_ASSOCIATIONS
-- ==========================================

-- Drop existing policies
DROP POLICY IF EXISTS tag_associations_select_policy ON contact_tag_associations;
DROP POLICY IF EXISTS tag_associations_insert_policy ON contact_tag_associations;
DROP POLICY IF EXISTS tag_associations_delete_policy ON contact_tag_associations;

-- Create enhanced select policy that checks contact ownership AND email confirmation
CREATE POLICY "Users can view their own tag associations if email confirmed"
ON contact_tag_associations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.contact_id = contact_id AND c.user_id = auth.uid()
  ) AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_custom_verified = true
  )
);

-- Create enhanced insert policy that checks contact/tag ownership AND email confirmation
CREATE POLICY "Users can create tag associations if email confirmed"
ON contact_tag_associations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.contact_id = contact_id AND c.user_id = auth.uid()
  ) AND
  EXISTS (
    SELECT 1 FROM contact_tags t
    WHERE t.id = tag_id AND t.user_id = auth.uid()
  ) AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_custom_verified = true
  )
);

-- Create enhanced delete policy that checks contact ownership AND email confirmation
CREATE POLICY "Users can delete tag associations if email confirmed"
ON contact_tag_associations
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.contact_id = contact_id AND c.user_id = auth.uid()
  ) AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_custom_verified = true
  )
);

-- ==========================================
-- ENHANCE EXISTING RLS POLICIES FOR CONTACTS_AUDIT
-- ==========================================

-- Drop existing policy
DROP POLICY IF EXISTS contacts_audit_select_policy ON contacts_audit;

-- Create enhanced policy that checks both user_id match AND email confirmation
CREATE POLICY "Users can view their own audit logs if email confirmed"
ON contacts_audit
FOR SELECT
USING (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_custom_verified = true
  )
);

-- ==========================================
-- ENHANCE EXISTING RLS POLICIES FOR CONTACT_OPERATIONS_LOG
-- ==========================================

-- Drop existing policy
DROP POLICY IF EXISTS operations_log_select_policy ON contact_operations_log;

-- Create enhanced policy that checks both user_id match AND email confirmation
CREATE POLICY "Users can view their own operation logs if email confirmed"
ON contact_operations_log
FOR SELECT
USING (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_custom_verified = true
  )
);

-- Commit the transaction
COMMIT;