import { Alert, AlertStatus, AlertPriority } from '../types/domain';

export class FastAlertFormatter {
  /**
   * Format alerts for display in markdown
   * @param alerts Array of alerts to format
   * @param searchTermForDisplay Search term to include in the message
   * @returns Formatted markdown string
   */
  static formatAlertsForDisplay(
    alerts: Alert[],
    _searchTermForDisplay?: string
  ): string {
    if (!alerts || alerts.length === 0) {
      return "No alerts found.";
    }
    
    const statusOrder = {
      [AlertStatus.PENDING]: 1,
      [AlertStatus.TRIGGERED]: 2,
      [AlertStatus.SNOOZED]: 3,
      [AlertStatus.DISMISSED]: 4
    };
    
    const priorityLabels = {
      [AlertPriority.HIGH]: '🔴 High',
      [AlertPriority.MEDIUM]: '🟠 Medium',
      [AlertPriority.LOW]: '🟢 Low'
    };
    
    // Group alerts by status for better organization
    const alertsByStatus: Record<string, Alert[]> = {};
    
    alerts.forEach(alert => {
      if (!alertsByStatus[alert.status]) {
        alertsByStatus[alert.status] = [];
      }
      alertsByStatus[alert.status].push(alert);
    });
    
    // Sort statuses by importance
    const sortedStatuses = Object.keys(alertsByStatus).sort(
      (a, b) => statusOrder[a as AlertStatus] - statusOrder[b as AlertStatus]
    );
    
    // Format the alerts
    let formattedOutput = "";
    
    sortedStatuses.forEach(status => {
      // Add a section header for each status
      formattedOutput += `### ${this.formatStatusLabel(status as AlertStatus)} Alerts\n\n`;
      
      // Sort alerts by due date, then priority
      const sortedAlerts = alertsByStatus[status].sort((a, b) => {
        // First by due date (ascending)
        const dateA = new Date(a.due_date).getTime();
        const dateB = new Date(b.due_date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        
        // Then by priority (high to low)
        return b.priority - a.priority;
      });
      
      // Format each alert in this status group
      sortedAlerts.forEach((alert, index) => {
        const dueDate = new Date(alert.due_date);
        const formattedDate = this.formatDateForDisplay(dueDate);
        
        const description = alert.description 
          ? `\n   ${alert.description.replace(/\n/g, '\n   ')}` 
          : '';
          
        const priorityLabel = priorityLabels[alert.priority] || 'Normal';
        
        formattedOutput += `**${index + 1}. ${alert.title}** (${priorityLabel})\n`;
        formattedOutput += `   Due: **${formattedDate}**${description}\n`;
        
        // Add associated entities if any
        if (alert.contact_id) {
          formattedOutput += `   Related to contact with ID: ${alert.contact_id}\n`;
        }
        if (alert.event_id) {
          formattedOutput += `   Related to event with ID: ${alert.event_id}\n`;
        }
        
        // Add tags if any
        if (alert.tags && alert.tags.length > 0) {
          formattedOutput += `   Tags: ${alert.tags.map(tag => `\`${tag}\``).join(', ')}\n`;
        }
        
        // Add specific status details
        if (status === AlertStatus.SNOOZED && alert.snoozed_until) {
          const snoozeDate = new Date(alert.snoozed_until);
          formattedOutput += `   Snoozed until: **${this.formatDateForDisplay(snoozeDate)}**\n`;
        }
        
        // Add space between alerts
        formattedOutput += '\n';
      });
    });
    
    return formattedOutput.trim();
  }
  
  /**
   * Format an alert status as a user-friendly label
   * @param status The alert status to format
   * @returns Formatted status label
   */
  static formatStatusLabel(status: AlertStatus): string {
    switch (status) {
      case AlertStatus.PENDING:
        return 'Pending';
      case AlertStatus.TRIGGERED:
        return 'Triggered';
      case AlertStatus.SNOOZED:
        return 'Snoozed';
      case AlertStatus.DISMISSED:
        return 'Dismissed';
      default:
        return 'Unknown';
    }
  }
  
  /**
   * Format a date for display with a relative time indicator
   * @param date The date to format
   * @returns Formatted date string
   */
  static formatDateForDisplay(date: Date): string {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    const isToday = date >= todayStart && date < tomorrowStart;
    const isTomorrow = date >= tomorrowStart && date < new Date(tomorrowStart.getTime() + 86400000);
    const isThisWeek = date >= weekStart && date <= weekEnd;
    
    // Format the date for display
    const timeOptions: Intl.DateTimeFormatOptions = { 
      hour: 'numeric', 
      minute: 'numeric', 
      hour12: true 
    };
    
    const dateOptions: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    };
    
    const timeStr = date.toLocaleTimeString('en-US', timeOptions);
    const dateStr = date.toLocaleDateString('en-US', dateOptions);
    
    // Add a relative time description
    let relativePrefix = '';
    if (isToday) {
      relativePrefix = 'Today';
    } else if (isTomorrow) {
      relativePrefix = 'Tomorrow';
    } else if (isThisWeek) {
      relativePrefix = dateStr.split(',')[0]; // Just the day of week
    } else {
      return `${dateStr} at ${timeStr}`;
    }
    
    return `${relativePrefix} at ${timeStr}`;
  }
  
  /**
   * Format a single alert's details as markdown
   * @param alert The alert to format
   * @returns Markdown formatted alert details
   */
  static formatSingleAlert(alert: Alert): string {
    if (!alert) {
      return "Alert not found.";
    }
    
    const dueDate = new Date(alert.due_date);
    const formattedDate = this.formatDateForDisplay(dueDate);
    
    const priorityLabels = {
      [AlertPriority.HIGH]: '🔴 High',
      [AlertPriority.MEDIUM]: '🟠 Medium',
      [AlertPriority.LOW]: '🟢 Low'
    };
    
    const statusLabels = {
      [AlertStatus.PENDING]: '⏳ Pending',
      [AlertStatus.TRIGGERED]: '🔔 Triggered',
      [AlertStatus.SNOOZED]: '💤 Snoozed',
      [AlertStatus.DISMISSED]: '✓ Dismissed'
    };
    
    let output = `## Alert: ${alert.title}\n\n`;
    output += `**Status:** ${statusLabels[alert.status] || alert.status}\n`;
    output += `**Priority:** ${priorityLabels[alert.priority] || alert.priority}\n`;
    output += `**Due Date:** ${formattedDate}\n`;
    
    if (alert.description) {
      output += `\n**Description:**\n${alert.description}\n`;
    }
    
    if (alert.status === AlertStatus.SNOOZED && alert.snoozed_until) {
      const snoozeDate = new Date(alert.snoozed_until);
      output += `\n**Snoozed Until:** ${this.formatDateForDisplay(snoozeDate)}\n`;
    }
    
    if (alert.tags && alert.tags.length > 0) {
      output += `\n**Tags:** ${alert.tags.map(tag => `\`${tag}\``).join(', ')}\n`;
    }
    
    if (alert.recurring) {
      output += `\n**Recurring:** Yes`;
      if (alert.recurrence_rule) {
        output += ` (${this.formatRecurrenceRule(alert.recurrence_rule)})`;
      }
      output += '\n';
    }
    
    return output;
  }
  
  /**
   * Format a recurrence rule in a user-friendly way
   * @param rule The recurrence rule in iCal format
   * @returns User-friendly description
   */
  static formatRecurrenceRule(rule: string): string {
    // This is a simplistic implementation and could be enhanced
    if (!rule) return 'Custom pattern';
    
    if (rule.includes('FREQ=DAILY')) {
      return 'Daily';
    } else if (rule.includes('FREQ=WEEKLY')) {
      return 'Weekly';
    } else if (rule.includes('FREQ=MONTHLY')) {
      return 'Monthly';
    } else if (rule.includes('FREQ=YEARLY')) {
      return 'Yearly';
    }
    
    return 'Custom pattern';
  }
} 