import { BadgeVariant } from '../components/common/Badge';

// Status mappings for import/processing operations
export const getStatusBadgeVariant = (status: string): BadgeVariant => {
  const statusLower = status.toLowerCase();
  
  switch (statusLower) {
    case 'completed':
    case 'success':
    case 'successful':
      return 'success';
    
    case 'pending':
    case 'processing':
    case 'in_progress':
    case 'loading':
      return 'warning';
    
    case 'partial':
    case 'partial_success':
      return 'secondary';
    
    case 'failed':
    case 'error':
    case 'cancelled':
    case 'rejected':
      return 'danger';
    
    case 'info':
    case 'information':
      return 'info';
    
    default:
      return 'neutral';
  }
};

// Priority mappings for alerts and importance levels
export const getPriorityBadgeVariant = (priority: string): BadgeVariant => {
  const priorityLower = priority.toLowerCase();
  
  switch (priorityLower) {
    case 'high':
    case 'critical':
    case 'urgent':
      return 'danger';
    
    case 'medium':
    case 'normal':
    case 'moderate':
      return 'warning';
    
    case 'low':
    case 'minor':
      return 'info';
    
    default:
      return 'neutral';
  }
};

// Confidence mappings for duplicate detection and ML results
export const getConfidenceBadgeVariant = (confidence: string): BadgeVariant => {
  const confidenceLower = confidence.toLowerCase();
  
  switch (confidenceLower) {
    case 'high':
    case 'very_high':
      return 'success';
    
    case 'medium':
    case 'moderate':
      return 'warning';
    
    case 'low':
    case 'very_low':
      return 'danger';
    
    default:
      return 'neutral';
  }
};

// Alert type mappings
export const getAlertTypeBadgeVariant = (type: string): BadgeVariant => {
  const typeLower = type.toLowerCase();
  
  switch (typeLower) {
    case 'system':
    case 'security':
      return 'danger';
    
    case 'notification':
    case 'reminder':
      return 'info';
    
    case 'update':
    case 'feature':
      return 'primary';
    
    case 'maintenance':
    case 'scheduled':
      return 'warning';
    
    default:
      return 'neutral';
  }
};

// Password strength mappings
export const getPasswordStrengthVariant = (score: number): BadgeVariant => {
  if (score >= 4) return 'success';
  if (score >= 3) return 'warning';
  if (score >= 2) return 'secondary';
  return 'danger';
};

// Progress indicator mappings
export const getProgressBadgeVariant = (percentage: number): BadgeVariant => {
  if (percentage >= 100) return 'success';
  if (percentage >= 75) return 'info';
  if (percentage >= 50) return 'warning';
  if (percentage >= 25) return 'secondary';
  return 'neutral';
};

// General utility to format badge text
export const formatBadgeText = (text: string): string => {
  return text
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Type-safe status values
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
export type AlertPriority = 'high' | 'medium' | 'low';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type AlertType = 'system' | 'notification' | 'update' | 'maintenance' | 'security' | 'reminder' | 'feature';