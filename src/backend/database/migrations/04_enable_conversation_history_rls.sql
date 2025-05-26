-- Enable RLS on conversation_history table and create appropriate policies

-- Enable Row Level Security
ALTER TABLE public.conversation_history ENABLE ROW LEVEL SECURITY;

-- Create policy for users to only access their own conversation history
CREATE POLICY "Users can manage their own conversation history"
  ON public.conversation_history FOR ALL
  USING (auth.uid() = user_id);

-- Create policy for service role to bypass RLS (for admin functions)
CREATE POLICY "Allow service_role to bypass RLS"
  ON public.conversation_history FOR ALL
  TO service_role
  USING (true);