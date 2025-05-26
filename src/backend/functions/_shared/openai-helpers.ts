/**
 * Helper functions for OpenAI interactions
 */

/**
 * Get system prompt from environment variable or use default
 */
export function getSystemPromptFromEnvironmentOrDefault(envVarName: string, defaultPrompt: string): string {
  return process.env[envVarName] || defaultPrompt;
}

/**
 * Enrich a prompt with additional context
 */
export function enrichPrompt(prompt: string, context: Record<string, string>): string {
  let enrichedPrompt = prompt;
  
  // Add context variables to the prompt
  Object.entries(context).forEach(([_key, value]) => {
    enrichedPrompt += `\n\n${value}`;
  });
  
  return enrichedPrompt;
}

/**
 * Call OpenAI with messages and system prompt
 */
export async function callOpenAI(
  messages: Array<Record<string, unknown>>,
  systemPrompt: string, 
  apiKey: string,
  model: string = 'gpt-4.1-mini'
): Promise<string> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          ...messages
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    throw error;
  }
}

/**
 * Make a request to OpenAI
 */
export async function makeOpenAIRequest(
  messages: Array<Record<string, unknown>>,
  systemPrompt: string,
  apiKey: string,
  model: string = 'gpt-4.1-mini'
): Promise<string> {
  return callOpenAI(messages, systemPrompt, apiKey, model);
}

/**
 * Extract intention from OpenAI's response
 */
export function extractIntentionFromResponse(userMessage: string, _response: string): {
  action: string;
  data?: unknown;
  identifiers?: {
    alertId?: string;
    contactId?: string;
    eventId?: string;
  };
} {
  // Simple heuristic-based extraction for demo purposes
  // In a real implementation, you might want to use a more structured approach
  
  const action = determineAction(userMessage.toLowerCase());
  
  // Extract identifiers
  const identifiers: Record<string, string> = {};
  
  // Look for IDs in the message
  const alertIdMatch = userMessage.match(/alert\s+(?:id|ID|Id)?\s*[:#]?\s*([a-f0-9-]{36})/i);
  if (alertIdMatch) {
    identifiers.alertId = alertIdMatch[1];
  }
  
  const contactIdMatch = userMessage.match(/contact\s+(?:id|ID|Id)?\s*[:#]?\s*([a-f0-9-]{36})/i);
  if (contactIdMatch) {
    identifiers.contactId = contactIdMatch[1];
  }
  
  // Extract data based on action
  const data: Record<string, unknown> = {};
  
  if (action === 'create_alert' || action === 'update_alert') {
    // Extract title
    const titleMatch = userMessage.match(/(?:title|named|called)[:\s]+["']?([^"'\n]+)["']?/i);
    if (titleMatch) {
      data.title = titleMatch[1].trim();
    }
    
    // Extract description
    const descMatch = userMessage.match(/(?:description|details)[:\s]+["']?([^"'\n]+)["']?/i);
    if (descMatch) {
      data.description = descMatch[1].trim();
    }
    
    // Extract date
    const dateMatch = userMessage.match(/(?:due|on|at|for)[:\s]+["']?([^"'\n]+)["']?/i);
    if (dateMatch) {
      data.dueDate = dateMatch[1].trim();
    }
    
    // Extract priority
    if (userMessage.includes('high priority') || userMessage.includes('urgent')) {
      data.priority = 'high';
    } else if (userMessage.includes('medium priority') || userMessage.includes('normal priority')) {
      data.priority = 'medium';
    } else if (userMessage.includes('low priority')) {
      data.priority = 'low';
    }
    
    // Extract type
    if (userMessage.includes('birthday')) {
      data.type = 'birthday';
    } else if (userMessage.includes('meeting')) {
      data.type = 'meeting';
    } else if (userMessage.includes('task')) {
      data.type = 'task';
    } else if (userMessage.includes('follow')) {
      data.type = 'follow_up';
    }
  }
  
  if (action === 'snooze_alert') {
    // Extract snooze time
    const snoozeMatch = userMessage.match(/(?:until|to)[:\s]+["']?([^"'\n]+)["']?/i);
    if (snoozeMatch) {
      data.snoozeUntil = snoozeMatch[1].trim();
    }
  }
  
  if (action === 'search_alerts' || action === 'list_alerts') {
    // Extract search parameters
    if (userMessage.includes('today')) {
      const today = new Date();
      data.fromDate = today.toISOString();
      
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);
      data.toDate = tomorrow.toISOString();
    } else if (userMessage.includes('this week')) {
      data.fromDate = new Date().toISOString();
      
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      data.toDate = nextWeek.toISOString();
    }
    
    // Extract status
    if (userMessage.includes('pending')) {
      data.status = 'pending';
    } else if (userMessage.includes('dismissed')) {
      data.status = 'dismissed';
    } else if (userMessage.includes('snoozed')) {
      data.status = 'snoozed';
    }
    
    // Extract priority
    if (userMessage.includes('high priority')) {
      data.priority = 'high';
    } else if (userMessage.includes('medium priority')) {
      data.priority = 'medium';
    } else if (userMessage.includes('low priority')) {
      data.priority = 'low';
    }
  }
  
  return { action, data, identifiers };
}

/**
 * Determine action based on user message
 */
function determineAction(message: string): string {
  // Create
  if (
    message.includes('create alert') || 
    message.includes('add alert') || 
    message.includes('make alert') || 
    message.includes('new alert') ||
    message.includes('set alert') ||
    message.includes('schedule alert')
  ) {
    return 'create_alert';
  }
  
  // Update
  if (
    message.includes('update alert') || 
    message.includes('edit alert') || 
    message.includes('modify alert') || 
    message.includes('change alert')
  ) {
    return 'update_alert';
  }
  
  // Delete
  if (
    message.includes('delete alert') || 
    message.includes('remove alert') || 
    message.includes('cancel alert')
  ) {
    return 'delete_alert';
  }
  
  // Get
  if (
    message.includes('get alert') || 
    message.includes('show alert') || 
    message.includes('find alert') ||
    message.includes('view alert') ||
    message.includes('alert details')
  ) {
    return 'get_alert';
  }
  
  // Dismiss
  if (
    message.includes('dismiss alert') || 
    message.includes('mark alert as done') || 
    message.includes('complete alert') ||
    message.includes('mark as dismissed')
  ) {
    return 'dismiss_alert';
  }
  
  // Snooze
  if (
    message.includes('snooze alert') || 
    message.includes('postpone alert') || 
    message.includes('delay alert') ||
    message.includes('remind me later')
  ) {
    return 'snooze_alert';
  }
  
  // List/Search
  if (
    message.includes('list alerts') || 
    message.includes('show alerts') || 
    message.includes('view alerts') ||
    message.includes('get alerts') ||
    message.includes('find alerts') ||
    message.includes('search alerts') ||
    message.includes('lookup alerts')
  ) {
    return message.includes('search') ? 'search_alerts' : 'list_alerts';
  }
  
  // Default
  return 'unknown';
} 