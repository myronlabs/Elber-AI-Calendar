import React from 'react';

// URL detection and link creation utilities

/**
 * Detects URLs in text and returns JSX with clickable links
 */
export const linkifyText = (text: string): React.ReactNode => {
  if (!text) return text;

  // Enhanced URL regex that matches various URL formats including zoom links
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
  
  const parts = text.split(urlRegex);
  
  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      return React.createElement('a', {
        key: index,
        href: part,
        target: '_blank',
        rel: 'noopener noreferrer',
        className: 'modal-link'
      }, part);
    }
    return part;
  });
};

/**
 * Checks if a string contains URLs
 */
export const containsUrl = (text: string): boolean => {
  if (!text) return false;
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
  return urlRegex.test(text);
};

/**
 * Extracts all URLs from a text string
 */
export const extractUrls = (text: string): string[] => {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
  return text.match(urlRegex) || [];
}; 