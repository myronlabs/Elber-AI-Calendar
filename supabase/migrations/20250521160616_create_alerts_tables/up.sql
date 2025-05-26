-- Create alerts enum type
CREATE TYPE public.alert_type AS ENUM (
  'upcoming_birthday',
  'meeting_reminder',
  'task_due',
  'follow_up',
  'custom'
);

CREATE TYPE public.alert_status AS ENUM (
  'pending',
  'triggered',
  'dismissed',
  'snoozed'
);

-- Create alerts table
CREATE TABLE public.alerts (
  alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  alert_type public.alert_type NOT NULL,
  status public.alert_status NOT NULL DEFAULT 'pending',
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  snoozed_until TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  priority SMALLINT NOT NULL DEFAULT 1, -- 1=low, 2=medium, 3=high
  contact_id UUID REFERENCES public.contacts(contact_id),
  event_id UUID, -- Optional reference to calendar events
  recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule TEXT, -- For recurring alerts (iCal format)
  parent_alert_id UUID REFERENCES public.alerts(alert_id), -- For recurring instances
  metadata JSONB, -- For type-specific data
  tags TEXT[]
);

-- Create index on user_id for quick lookups
CREATE INDEX idx_alerts_user_id ON public.alerts(user_id);

-- Create index on due_date for quick upcoming alerts queries
CREATE INDEX idx_alerts_due_date ON public.alerts(due_date);

-- Create index on status for filtering
CREATE INDEX idx_alerts_status ON public.alerts(status);

-- Create index on contact_id for linked contacts
CREATE INDEX idx_alerts_contact_id ON public.alerts(contact_id);

-- Create composite index for common queries
CREATE INDEX idx_alerts_user_status_due ON public.alerts(user_id, status, due_date);

-- Add RLS policies
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Policy for users to see only their own alerts
CREATE POLICY alerts_select_policy ON public.alerts
  FOR SELECT USING (auth.uid() = user_id);

-- Policy for users to insert their own alerts
CREATE POLICY alerts_insert_policy ON public.alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy for users to update their own alerts
CREATE POLICY alerts_update_policy ON public.alerts
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy for users to delete their own alerts
CREATE POLICY alerts_delete_policy ON public.alerts
  FOR DELETE USING (auth.uid() = user_id);

-- Create function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_alerts_updated_at_trigger
BEFORE UPDATE ON public.alerts
FOR EACH ROW
EXECUTE FUNCTION update_alerts_updated_at();

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT USAGE ON SEQUENCE public.alerts_id_seq TO authenticated;

-- Notify function for alerts
CREATE OR REPLACE FUNCTION notify_alert_changes()
RETURNS TRIGGER AS $$
DECLARE
  record_jsonb JSONB;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    record_jsonb = to_jsonb(NEW);
  ELSE
    record_jsonb = to_jsonb(OLD);
  END IF;
  
  PERFORM pg_notify(
    'alert_changes',
    json_build_object(
      'operation', TG_OP,
      'record', record_jsonb,
      'user_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END
    )::text
  );
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for alert changes
CREATE TRIGGER alerts_notify_changes
AFTER INSERT OR UPDATE OR DELETE ON public.alerts
FOR EACH ROW
EXECUTE FUNCTION notify_alert_changes(); 