import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

// Define Event interface for type safety
interface AppEvent { // Renamed to avoid conflict with DOM Event type if used in broader context
  event_id: string;
  title: string;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  is_all_day: boolean;
  description?: string;
  location?: string;
  // Add any other event-specific fields here, e.g., type, category, attendees
}

// In-memory mock database for testing events
const appEvents: AppEvent[] = [
  {
    event_id: "test-app-event-1",
    title: "Test App Event",
    start_time: new Date().toISOString(),
    end_time: new Date(Date.now() + 7200000).toISOString(), // 2 hours later
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: "test-user-events",
    is_all_day: false,
    description: "This is a test application event from events.ts",
    location: "Events Test Location"
  }
];

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  console.log("--- events.ts function invoked ---");
  console.log("HTTP Method:", event.httpMethod);
  console.log("Path:", event.path);
  console.log("Query Parameters:", event.queryStringParameters);
  console.log("Body:", event.body ? event.body : "No body");

  // Extract event ID from path if it exists (e.g., /events/{eventId})
  const pathParts = event.path.split('/');
  // Check if the last part is 'events' or if the path contains '/events/'
  const isEventsEndpoint = pathParts[pathParts.length - 1] === 'events' ||
                          event.path.includes('/events/') && pathParts[pathParts.length - 2] === 'events';
  const eventIdFromPath = !isEventsEndpoint ? pathParts[pathParts.length - 1] : null;

  // Set CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*", // Allow requests from any origin
    "Access-Control-Allow-Headers": "Content-Type, Authorization", // Specify allowed headers
    "Content-Type": "application/json"
  };

  // Handle preflight OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    console.log("--- events.ts handling OPTIONS preflight request ---");
    return {
      statusCode: 204, // No Content
      headers: {
        ...headers,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS" // Specify allowed methods
      },
      body: ""
    };
  }

  try {
    // Handle GET request - fetch all events or a specific event
    if (event.httpMethod === 'GET') {
      console.log("--- events.ts handling GET request ---");
      if (eventIdFromPath) {
        console.log(`Fetching event with ID: ${eventIdFromPath}`);
        const foundEvent = appEvents.find(e => e.event_id === eventIdFromPath);
        if (!foundEvent) {
          console.log(`Event with ID ${eventIdFromPath} not found.`);
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ message: `Event with ID ${eventIdFromPath} not found` })
          };
        }
        console.log(`Returning event: ${JSON.stringify(foundEvent)}`);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(foundEvent)
        };
      }
      console.log(`Returning all events: ${JSON.stringify(appEvents)}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(appEvents)
      };
    }

    // Handle POST request - create a new event
    if (event.httpMethod === 'POST') {
      console.log("--- events.ts handling POST request ---");
      if (!event.body) {
        console.log("Error: Missing event data in request body.");
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: "Missing event data in request body" })
        };
      }
      
      let eventData: Omit<AppEvent, 'event_id' | 'created_at' | 'updated_at'>;
      try {
        eventData = JSON.parse(event.body);
        console.log(`Parsed event data for POST: ${JSON.stringify(eventData)}`);
      } catch (parseError: unknown) { // Explicitly type parseError
        const message = (parseError instanceof Error) ? parseError.message : String(parseError);
        console.error("Error parsing POST request body:", message);
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: "Invalid JSON in request body", error: message })
        };
      }

      if (!eventData.title || !eventData.start_time || !eventData.end_time) {
        console.log("Error: Missing required fields (title, start_time, end_time).");
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: "Missing required fields: title, start_time, end_time" })
        };
      }
      
      const newEvent: AppEvent = {
        ...eventData,
        event_id: `app-event-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: eventData.user_id || "default-event-user",
        is_all_day: eventData.is_all_day || false
      };
      
      appEvents.push(newEvent);
      console.log(`New event created: ${JSON.stringify(newEvent)}`);
      return {
        statusCode: 201, // Created
        headers,
        body: JSON.stringify(newEvent)
      };
    }

    // Handle PUT request - update an existing event
    if (event.httpMethod === 'PUT') {
      console.log("--- events.ts handling PUT request ---");
      if (!eventIdFromPath) {
        console.log("Error: Missing event ID in path for PUT request.");
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: "Missing event ID in path" })
        };
      }
      if (!event.body) {
        console.log("Error: Missing event data in request body for PUT request.");
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: "Missing event data in request body" })
        };
      }
      
      const eventIndex = appEvents.findIndex(e => e.event_id === eventIdFromPath);
      if (eventIndex === -1) {
        console.log(`Event with ID ${eventIdFromPath} not found for PUT request.`);
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: `Event with ID ${eventIdFromPath} not found` })
        };
      }
      
      let updateData: Partial<Omit<AppEvent, 'event_id' | 'created_at' | 'updated_at'>>;
       try {
        updateData = JSON.parse(event.body);
        console.log(`Parsed update data for PUT: ${JSON.stringify(updateData)}`);
      } catch (parseError: unknown) { // Explicitly type parseError
        const message = (parseError instanceof Error) ? parseError.message : String(parseError);
        console.error("Error parsing PUT request body:", message);
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: "Invalid JSON in request body", error: message })
        };
      }

      const updatedEvent: AppEvent = {
        ...appEvents[eventIndex],
        ...updateData,
        updated_at: new Date().toISOString()
      };
      
      appEvents[eventIndex] = updatedEvent;
      console.log(`Event with ID ${eventIdFromPath} updated: ${JSON.stringify(updatedEvent)}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(updatedEvent)
      };
    }

    // Handle DELETE request - delete an event
    if (event.httpMethod === 'DELETE') {
      console.log("--- events.ts handling DELETE request ---");
      if (!eventIdFromPath) {
        console.log("Error: Missing event ID in path for DELETE request.");
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: "Missing event ID in path" })
        };
      }
      
      const eventIndex = appEvents.findIndex(e => e.event_id === eventIdFromPath);
      if (eventIndex === -1) {
        console.log(`Event with ID ${eventIdFromPath} not found for DELETE request.`);
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: `Event with ID ${eventIdFromPath} not found` })
        };
      }
      
      appEvents.splice(eventIndex, 1);
      console.log(`Event with ID ${eventIdFromPath} deleted.`);
      return {
        statusCode: 200, // Or 204 No Content if not returning a message
        headers,
        body: JSON.stringify({ success: true, message: `Event with ID ${eventIdFromPath} deleted` })
      };
    }

    // Handle unsupported HTTP methods
    console.log(`Unsupported HTTP method: ${event.httpMethod}`);
    return {
      statusCode: 405, // Method Not Allowed
      headers,
      body: JSON.stringify({ message: `Method ${event.httpMethod} Not Allowed` })
    };

  } catch (error: unknown) { // Explicitly type error
    const errorMessage = (error instanceof Error) ? error.message : String(error);
    console.error("Error in events.ts function:", errorMessage, error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Internal server error", error: errorMessage })
    };
  }
};

export { handler };
