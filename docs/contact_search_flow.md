# Contact Search Flow in Elber AI

## Full Engineering Flow Diagram

```mermaid
flowchart TD
    User[User enters search query] --> FrontendCheck{Is it an\ninstant search\nquery?}
    
    subgraph "Frontend - AssistantPage.tsx"
        FrontendCheck -->|Yes| InstantSearch[InstantContactSearch\nprocessMessage()]
        FrontendCheck -->|No| NormalFlow[Standard AI flow]
        
        InstantSearch --> SearchAPI[apiClient.post to\n/contacts-instant-search]
        
        InstantSearch --> StructuredDataCheck{Has\nstructuredData?}
        StructuredDataCheck -->|Yes| GenerateFormattedResp[Generate formatted response\nfrom structured data]
        StructuredDataCheck -->|No| UseOrigResp[Use original response]
        
        GenerateFormattedResp --> DisplayResults[Display results to user]
        UseOrigResp --> DisplayResults
    end
    
    SearchAPI --> BackendInstantSearch
    
    subgraph "Backend - contacts-instant-search.ts"
        BackendInstantSearch[contacts-instant-search\nreceives request] --> ContactSearchCall[Call contacts-search API]
        
        ContactSearchCall --> ProcessResults[Process search results]
        
        ProcessResults --> FormatterCall[Call FastContactFormatter]
        
        FormatterCall --> PrepareResponse[Prepare response with\nstructured data + formatted text]
    end
    
    subgraph "Backend - contacts-search.ts"
        ContactSearchCall --> CheckCache{Check\ncache}
        
        CheckCache -->|Cache hit| ReturnCached[Return cached results]
        CheckCache -->|Cache miss| OptimizedSearch[Call search_contacts_optimized\nRPC function]
        
        OptimizedSearch -->|Success| TransformResults[Transform results\nbut preserve match_score]
        OptimizedSearch -->|Error| FallbackSearch[Use fallback search]
        
        TransformResults --> SortByScore[Sort by match_score descending]
        FallbackSearch --> ManualScore[Calculate manual\nsimilarity scores]
        
        SortByScore --> ReturnSorted[Return sorted contacts]
        ManualScore --> SortBySimilarity[Sort by similarity]
        SortBySimilarity --> ReturnSorted
    end
    
    subgraph "Database - PostgreSQL"
        OptimizedSearch --> DbFunction[search_contacts_optimized function]
        
        DbFunction --> FTSSearch[Full-text search with\ntsquery/tsvector]
        
        FTSSearch --> AssignScores[Assign match_score based on\nrank and exact matches]
        
        AssignScores --> SortResults[Sort by score DESC,\nupdated_at DESC]
        
        SortResults --> ReturnResults[Return results to API]
    end
    
    ReturnResults --> TransformResults
    ReturnSorted --> ProcessResults
    
    PrepareResponse --> ReturnToFrontend[Return to frontend with\nstructured data + formatted text]
    
    ReturnToFrontend --> StructuredDataCheck
    
    classDef database fill:#f9f,stroke:#333,stroke-width:2px;
    classDef backend fill:#bbf,stroke:#333,stroke-width:1px;
    classDef frontend fill:#bfb,stroke:#333,stroke-width:1px;
    class DbFunction,FTSSearch,AssignScores,SortResults,ReturnResults database;
    class BackendInstantSearch,ContactSearchCall,ProcessResults,FormatterCall,PrepareResponse,CheckCache,OptimizedSearch,TransformResults,FallbackSearch,SortByScore,ReturnSorted,ManualScore,SortBySimilarity backend;
    class FrontendCheck,InstantSearch,SearchAPI,StructuredDataCheck,GenerateFormattedResp,UseOrigResp,DisplayResults,User frontend;
```

## Issue Identification

The original issue was that contacts weren't being displayed in the correct order based on relevance. The problem occurred at these stages:

1. **Database Layer** - The `search_contacts_optimized` correctly assigned match scores (5.0 for exact matches)
2. **contacts-search.ts** - Properly sorted by match_score in descending order but removed the match_score field
3. **contacts-instant-search.ts** - Passed the contacts to FastContactFormatter without the match_score
4. **FastContactFormatter** - Formatted results into text without preserving the original sort order
5. **Frontend Display** - Displayed this formatted text, losing the original ordering

## Solution Implementation

The solution addressed each layer of the flow:

1. **contacts-search.ts** - Maintained proper sorting by match_score and documented the order
2. **contacts-instant-search.ts** - Added structured data alongside the formatted text
3. **Frontend (AssistantPage.tsx)** - Updated to use structured data to regenerate the display
4. **Comprehensive Logging** - Added throughout the pipeline for debugging

This architectural change moved from text-based to structured data passing, ensuring the original ordering from the database is preserved through all processing steps up to the UI display. 