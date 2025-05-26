/**
 * Shared types for company knowledge base functions
 */

export interface CompanyQueryInput {
  query: string;
}

export interface CompanyQueryResult {
  answer: string;
  sources?: string[];
  confidence?: 'high' | 'medium' | 'low';
}

export interface CompanyInformationTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: {
        query: {
          type: 'string';
          description: string;
        };
      };
      required: string[];
      additionalProperties: boolean;
    };
  };
}