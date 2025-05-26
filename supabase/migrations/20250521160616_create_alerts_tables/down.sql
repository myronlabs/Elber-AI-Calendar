-- Drop trigger for alert changes
DROP TRIGGER IF EXISTS alerts_notify_changes ON public.alerts;

-- Drop the notify function
DROP FUNCTION IF EXISTS notify_alert_changes();

-- Drop permissions
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.alerts FROM authenticated;

-- Drop trigger for updated_at
DROP TRIGGER IF EXISTS update_alerts_updated_at_trigger ON public.alerts;

-- Drop updated_at function
DROP FUNCTION IF EXISTS update_alerts_updated_at();

-- Drop policies
DROP POLICY IF EXISTS alerts_select_policy ON public.alerts;
DROP POLICY IF EXISTS alerts_insert_policy ON public.alerts;
DROP POLICY IF EXISTS alerts_update_policy ON public.alerts;
DROP POLICY IF EXISTS alerts_delete_policy ON public.alerts;

-- Drop indexes
DROP INDEX IF EXISTS idx_alerts_user_status_due;
DROP INDEX IF EXISTS idx_alerts_contact_id;
DROP INDEX IF EXISTS idx_alerts_status;
DROP INDEX IF EXISTS idx_alerts_due_date;
DROP INDEX IF EXISTS idx_alerts_user_id;

-- Drop alerts table
DROP TABLE IF EXISTS public.alerts;

-- Drop enum types
DROP TYPE IF EXISTS public.alert_status;
DROP TYPE IF EXISTS public.alert_type; 