# Elber - AI-Powered Calendar & Contact Management System

A sophisticated calendar and contact management system with AI assistant integration, built with TypeScript, React, and Supabase.

## 🚀 Features

### Calendar Management
- **Smart Event Creation**: AI-powered event creation with natural language processing
- **Real-time Sync**: Automatic calendar refresh after operations
- **Event Details**: Rich event modals with edit and delete functionality
- **Recurring Events**: Support for recurring event patterns
- **Time Zone Support**: Intelligent time zone handling

### Contact Management
- **Advanced Search**: Fast, intelligent contact search and filtering
- **Grid & List Views**: Multiple viewing options for contacts
- **Bulk Operations**: Select and manage multiple contacts
- **Professional UI**: Enterprise-grade contact management interface
- **Real-time Updates**: Automatic refresh after contact operations

### AI Assistant
- **Natural Language**: Create, update, and delete events using natural language
- **Smart Parsing**: Intelligent extraction of event details from user input
- **Context Awareness**: Maintains conversation context for better interactions
- **Multi-operation Support**: Handle calendar and contact operations seamlessly

## 🛠 Tech Stack

- **Frontend**: React, TypeScript, SCSS
- **Backend**: Netlify Functions, TypeScript
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI GPT-4
- **Authentication**: Supabase Auth
- **Deployment**: Netlify

## 📁 Project Structure

```
src/
├── frontend/           # React frontend application
│   ├── components/     # Reusable UI components
│   ├── pages/         # Main application pages
│   ├── hooks/         # Custom React hooks
│   ├── context/       # React context providers
│   ├── services/      # API service functions
│   ├── styles/        # SCSS styling (mobile-first)
│   └── utils/         # Utility functions
├── backend/           # Backend functions and services
│   ├── functions/     # Netlify serverless functions
│   ├── services/      # Backend service modules
│   ├── types/         # TypeScript type definitions
│   └── utils/         # Backend utility functions
└── supabase/          # Database migrations and functions
    ├── migrations/    # Database schema migrations
    └── functions/     # Supabase Edge Functions
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account
- OpenAI API key
- Google OAuth credentials (optional)

### Environment Setup

1. Clone the repository:
```bash
git clone https://github.com/slyfox1186/ElberMaster.git
cd ElberMaster
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure environment variables in `.env`:
```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Application Settings
VITE_APP_URL=http://localhost:3000
```

### Database Setup

1. Create a new Supabase project
2. Run the database migrations:
```bash
npx supabase db push
```

### Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## 🏗 Architecture

### Frontend Architecture
- **Mobile-First Design**: Responsive SCSS with mobile-first approach
- **Component-Based**: Modular React components with TypeScript
- **Context Management**: React Context for state management
- **Custom Hooks**: Reusable logic in custom hooks
- **Service Layer**: Abstracted API calls and business logic

### Backend Architecture
- **Serverless Functions**: Netlify Functions for API endpoints
- **Intelligent Handlers**: AI-powered request processing
- **Type Safety**: 100% TypeScript coverage
- **Error Handling**: Comprehensive error handling and logging
- **Security**: JWT authentication and input validation

### Database Schema
- **Users**: User authentication and profiles
- **Calendar Events**: Event storage with recurrence support
- **Contacts**: Contact management with search optimization
- **Conversations**: AI assistant conversation history

## 🔧 Key Features Implementation

### Calendar Refresh System
- Automatic refresh after AI operations
- Event-driven architecture with custom events
- Real-time UI updates without page reload

### AI Assistant Integration
- Natural language processing for calendar operations
- Context-aware conversation management
- Intelligent entity extraction and validation

### Contact Management
- Advanced search with fuzzy matching
- Pagination with customizable page sizes
- Grid and list view modes
- Bulk selection and operations

## 🚀 Deployment

### Netlify Deployment

1. Connect your GitHub repository to Netlify
2. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
3. Add environment variables in Netlify dashboard
4. Deploy!

### Supabase Setup

1. Create project in Supabase dashboard
2. Configure authentication providers
3. Set up RLS policies
4. Deploy Edge Functions if needed

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- OpenAI for GPT-4 API
- Supabase for backend infrastructure
- Netlify for hosting and serverless functions
- React and TypeScript communities

## 📞 Support

For support, email support@elber.ai or create an issue in this repository.

---

Built with ❤️ by the Elber Team 