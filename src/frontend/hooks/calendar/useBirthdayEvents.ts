import { useMemo, useCallback, useState, useEffect } from 'react';
import { Contact } from '../../../backend/types';
import { RecurringCalendarEvent } from '../../types/recurrence';
import { apiClient } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

interface UseBirthdayEventsReturn {
  birthdayEvents: RecurringCalendarEvent[];
  contactsWithBirthdays: Contact[];
  fetchContactsWithBirthdays: () => Promise<void>;
  isLoading: boolean;
}

export const useBirthdayEvents = (
  showBirthdayEvents: boolean,
  today: Date
): UseBirthdayEventsReturn => {
  const { session } = useAuth();
  const [contactsWithBirthdays, setContactsWithBirthdays] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // PERFORMANCE: Cache today's year and ISO string
  const { currentYear, todayISO } = useMemo(() => ({
    currentYear: today.getFullYear(),
    todayISO: today.toISOString()
  }), [today]);

  // Fetch contacts with birthdays
  const fetchContactsWithBirthdays = useCallback(async () => {
    if (!session) return;

    setIsLoading(true);
    try {
      const response = await apiClient.get<{success: boolean, contacts: Contact[]}>('/contacts');
      if (response?.success && Array.isArray(response.contacts)) {
        const contactsWithBdays = response.contacts.filter((contact: Contact) =>
          contact.birthday && contact.birthday.trim() !== ''
        );
        setContactsWithBirthdays(contactsWithBdays);
        console.log(`[useBirthdayEvents] Found ${contactsWithBdays.length} contacts with birthdays`);
      }
    } catch (error) {
      console.error('[useBirthdayEvents] Error fetching contacts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  // PERFORMANCE: Generate birthday events only when dependencies change
  const birthdayEvents = useMemo(() => {
    if (!showBirthdayEvents || contactsWithBirthdays.length === 0) {
      return [];
    }

    return contactsWithBirthdays.map((contact, index) => {
      const [birthMonth, birthDay] = (contact.birthday || '').split('-').map(Number);
      if (!birthMonth || !birthDay) return null;

      const thisYearBirthday = new Date(currentYear, birthMonth - 1, birthDay);
      thisYearBirthday.setHours(0, 0, 0, 0);
      const birthdayISO = thisYearBirthday.toISOString();

      return {
        event_id: `birthday-${contact.contact_id}-${index}`,
        user_id: contact.user_id,
        title: `${contact.first_name} ${contact.last_name}'s Birthday`,
        start_time: birthdayISO,
        end_time: birthdayISO,
        is_all_day: true,
        description: `Birthday celebration for ${contact.first_name} ${contact.last_name}`,
        location: null,
        created_at: todayISO,
        updated_at: todayISO,
        is_recurring: true,
        recurrence_pattern: 'yearly',
        recurrence_interval: 1,
        recurrence_month: birthMonth,
        recurrence_day_of_month: birthDay,
        google_event_id: null,
        zoom_meeting_id: null,
        recurrence_day_of_week: null,
        recurrence_end_date: null,
        recurrence_count: null,
        recurrence_rule: null,
        parent_event_id: null,
        is_exception: false,
        exception_date: null,
        series_id: null,
        recurrence_timezone: null
      } as RecurringCalendarEvent;
    }).filter(Boolean) as RecurringCalendarEvent[];
  }, [contactsWithBirthdays, showBirthdayEvents, currentYear, todayISO]);

  // Load birthday contacts on explicit request
  useEffect(() => {
    const isExplicitRequest = sessionStorage.getItem('elber_explicit_birthday_request') === 'true';
    if (session && isExplicitRequest) {
      fetchContactsWithBirthdays();
      sessionStorage.removeItem('elber_explicit_birthday_request');
    }
  }, [session, fetchContactsWithBirthdays]);

  return {
    birthdayEvents,
    contactsWithBirthdays,
    fetchContactsWithBirthdays,
    isLoading
  };
}; 