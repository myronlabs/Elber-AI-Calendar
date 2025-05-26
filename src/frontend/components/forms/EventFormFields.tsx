import React from 'react';
import { RecurringCalendarEvent, RecurrencePatternType, DayOfWeek } from '../../types/recurrence';
import FormField from './FormField';

// Helper to get string value, defaulting to empty string if null/undefined
const getString = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

// UI specific state parts that are not directly on RecurringCalendarEvent
export interface EventFormUIState {
  ui_start_date: string;
  ui_start_time: string;
  ui_end_date: string;
  ui_end_time: string;
  end_type?: 'count' | 'until' | 'never'; 
}

export type EventFormData = Partial<RecurringCalendarEvent> & Partial<EventFormUIState>;

interface EventFormFieldsProps {
  eventData: EventFormData;
   
  onChange: (_updatedEventData: EventFormData) => void;
}

const EventFormFields: React.FC<EventFormFieldsProps> = ({ eventData, onChange }) => {

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let processedValue: string | number | boolean | string[] | undefined | RecurrencePatternType | DayOfWeek[] = value;

    if (type === 'checkbox') {
      processedValue = (e.target as HTMLInputElement).checked;
    } else if (type === 'number') {
      processedValue = value === '' ? undefined : parseFloat(value);
    } else if (name === 'recurrence_day_of_week') {
      // For multi-select or group of checkboxes representing days of week
      const DOWValue = parseInt(value as string, 10) as DayOfWeek;
      const currentDays = eventData.recurrence_day_of_week || [];
      if ((e.target as HTMLInputElement).checked) {
        processedValue = [...currentDays, DOWValue].sort((a, b) => a - b);
      } else {
        processedValue = currentDays.filter(day => day !== DOWValue).sort((a, b) => a - b);
      }
    } else if (name === 'recurrence_pattern') {
      processedValue = value as RecurrencePatternType;
    }

    const newEventData: EventFormData = { ...eventData, [name]: processedValue };

    // Handle cascading changes, e.g., is_all_day or date changes
    if (name === 'is_all_day') {
      const isAllDayChecked = processedValue as boolean;
      newEventData.is_all_day = isAllDayChecked;
      if (isAllDayChecked) {
        newEventData.ui_end_date = newEventData.ui_start_date;
        // Optionally clear time fields or backend should ignore them if is_all_day is true
        newEventData.ui_start_time = ''; // Or specific like '00:00'
        newEventData.ui_end_time = '';   // Or specific like '23:59'
      }
    } else if (name === 'ui_start_date') {
      newEventData.ui_start_date = value;
      if (eventData.is_all_day) {
        newEventData.ui_end_date = value; 
      } else if (!newEventData.ui_end_date || newEventData.ui_end_date < value) {
        // If end date is not set or is before new start date, adjust it (e.g., to be same or next day)
        newEventData.ui_end_date = value; 
      }
    } else if (name === 'end_type') {
      const endType = value as 'count' | 'until' | 'never';
      newEventData.end_type = endType;
      if (endType === 'count') {
        newEventData.recurrence_count = eventData.recurrence_count || 10;
        newEventData.recurrence_end_date = undefined;
      } else if (endType === 'until') {
        newEventData.recurrence_count = undefined;
        if (!eventData.recurrence_end_date && eventData.ui_start_date) {
          const startDate = new Date(eventData.ui_start_date);
          startDate.setMonth(startDate.getMonth() + 3);
          newEventData.recurrence_end_date = startDate.toISOString().split('T')[0];
        } else {
          newEventData.recurrence_end_date = eventData.recurrence_end_date || undefined;
        }
      } else { // never
        newEventData.recurrence_count = undefined;
        newEventData.recurrence_end_date = undefined;
      }
    }

    onChange(newEventData);
  };

  // Default values for recurrence if not present, especially when toggling is_recurring
  const isRecurring = eventData.is_recurring || false;
  const recurrencePattern = eventData.recurrence_pattern || RecurrencePatternType.WEEKLY;
  const recurrenceInterval = eventData.recurrence_interval || 1;
  const endType = eventData.end_type || 'count';
  const recurrenceCount = eventData.recurrence_count || 10;
  
  const defaultEndDate = () => {
    const startDate = new Date(eventData.ui_start_date || new Date());
    startDate.setMonth(startDate.getMonth() + 3);
    return startDate.toISOString().split('T')[0];
  };
  const recurrenceEndDate = eventData.recurrence_end_date || defaultEndDate();

  const today = new Date();
  const currentDayOfWeek = ((today.getDay() + 6) % 7) + 1 as DayOfWeek; 
  const recurrenceDayOfWeek = eventData.recurrence_day_of_week && eventData.recurrence_day_of_week.length > 0 
    ? eventData.recurrence_day_of_week 
    : [currentDayOfWeek];
  const recurrenceDayOfMonth = eventData.recurrence_day_of_month || today.getDate();

  return (
    <div className="event-form-fields">
      <div className="form-group">
        <FormField 
          id="title" 
          label="Title*" 
          value={getString(eventData.title)} 
          onChange={handleChange} 
          name="title" 
          required 
        />
      </div>

      <div className="form-group form-group-checkbox">
        <input 
          type="checkbox" 
          id="is_all_day" 
          name="is_all_day" 
          checked={eventData.is_all_day || false} 
          onChange={handleChange}
        />
        <label htmlFor="is_all_day">All Day Event</label>
      </div>

      <div className="form-group">
        <div className="date-time-grid">
          <FormField 
            id="ui_start_date" 
            label="Start Date*" 
            type="date" 
            value={getString(eventData.ui_start_date)} 
            onChange={handleChange} 
            name="ui_start_date" 
            required 
          />
          {!eventData.is_all_day && (
            <FormField 
              id="ui_start_time" 
              label="Start Time*" 
              type="time" 
              value={getString(eventData.ui_start_time)} 
              onChange={handleChange} 
              name="ui_start_time" 
              required 
            />
          )}
          <FormField 
            id="ui_end_date" 
            label="End Date*" 
            type="date" 
            value={getString(eventData.ui_end_date)} 
            onChange={handleChange} 
            name="ui_end_date" 
            required 
          />
          {!eventData.is_all_day && (
            <FormField 
              id="ui_end_time" 
              label="End Time*" 
              type="time" 
              value={getString(eventData.ui_end_time)} 
              onChange={handleChange} 
              name="ui_end_time" 
              required 
            />
          )}
        </div>
      </div>

      <div className="form-group">
        <FormField 
          id="location" 
          label="Location" 
          value={getString(eventData.location)} 
          onChange={handleChange} 
          name="location" 
        />
      </div>
      <div className="form-group">
        <FormField 
          id="description" 
          label="Description" 
          type="textarea" 
          value={getString(eventData.description)} 
          onChange={handleChange} 
          name="description" 
          rows={4} 
        />
      </div>

      {/* --- Recurrence Section --- */}
      <div className="form-group form-group-checkbox">
        <input 
          type="checkbox" 
          id="is_recurring" 
          name="is_recurring" 
          checked={isRecurring} 
          onChange={handleChange} 
        />
        <label htmlFor="is_recurring">Recurring Event</label>
      </div>

      {isRecurring && (
        <div className="recurrence-options-panel card card-subtle">
          <div className="form-group">
            <FormField
              id="recurrence_pattern"
              label="Repeats"
              type="select"
              value={recurrencePattern}
              onChange={handleChange}
              name="recurrence_pattern"
            >
              <option value={RecurrencePatternType.DAILY}>Daily</option>
              <option value={RecurrencePatternType.WEEKLY}>Weekly</option>
              <option value={RecurrencePatternType.MONTHLY}>Monthly</option>
              <option value={RecurrencePatternType.YEARLY}>Yearly</option>
              {/* <option value={RecurrencePatternType.CUSTOM}>Custom (RRULE)</option> */}
            </FormField>
          </div>

          <div className="form-group">
            <div className="input-with-unit">
              <FormField
                id="recurrence_interval"
                label="Every"
                type="number"
                value={getString(recurrenceInterval)}
                onChange={handleChange}
                name="recurrence_interval"
                min={1}
              />
              <span className="interval-unit-label">
                {recurrencePattern === RecurrencePatternType.DAILY && 'day(s)'}
                {recurrencePattern === RecurrencePatternType.WEEKLY && 'week(s)'}
                {recurrencePattern === RecurrencePatternType.MONTHLY && 'month(s)'}
                {recurrencePattern === RecurrencePatternType.YEARLY && 'year(s)'}
              </span>
            </div>
          </div>

          {recurrencePattern === RecurrencePatternType.WEEKLY && (
            <div className="form-group" role="group" aria-labelledby="dow-label">
              <span id="dow-label" className="form-label">On these days:</span>
              <div className="weekday-checkboxes">
                {(Object.keys(DayOfWeek) as Array<keyof typeof DayOfWeek>)
                  .filter(key => !isNaN(Number(DayOfWeek[key])))
                  .map((key) => (
                    <label key={DayOfWeek[key]} className="weekday-checkbox-label">
                      <input
                        type="checkbox"
                        name="recurrence_day_of_week"
                        value={DayOfWeek[key]}
                        checked={recurrenceDayOfWeek.includes(DayOfWeek[key] as DayOfWeek)}
                        onChange={handleChange}
                      />
                      <span>{key.substring(0,3)}</span>
                    </label>
                ))}
              </div>
            </div>
          )}

          {recurrencePattern === RecurrencePatternType.MONTHLY && (
            <div className="form-group">
              <FormField
                id="recurrence_day_of_month"
                label="Day of month:"
                type="number"
                value={getString(recurrenceDayOfMonth)}
                onChange={handleChange}
                name="recurrence_day_of_month"
                min={1}
                max={31}
              />
            </div>
          )}
          
          {recurrencePattern === RecurrencePatternType.YEARLY && (
            <>
             <div className="form-group">
               <FormField
                  id="recurrence_month"
                  label="Month of Year:"
                  type="select" // Or number input 1-12
                  value={getString(eventData.recurrence_month || new Date(eventData.ui_start_date || Date.now()).getMonth() + 1)}
                  onChange={handleChange}
                  name="recurrence_month"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString('default', { month: 'long' })}</option>
                  ))}
                </FormField>
              </div>
              <div className="form-group">
                <FormField
                  id="recurrence_day_of_month_yearly"
                  label="Day of month:"
                  type="number"
                  value={getString(eventData.recurrence_day_of_month || new Date(eventData.ui_start_date || Date.now()).getDate())}
                  onChange={(e) => handleChange({ ...e, target: { ...e.target, name: 'recurrence_day_of_month'} } as React.ChangeEvent<HTMLInputElement>)}
                  name="recurrence_day_of_month_yearly" // Different name to avoid conflict if we want separate state
                  min={1}
                  max={31}
                />
              </div>
            </>
          )}


          <div className="form-group recurrence-end-options" role="group" aria-labelledby="ends-on-label">
            <span id="ends-on-label" className="form-label">Ends:</span>
            <div className="radio-group">
              <label>
                <input type="radio" name="end_type" value="count" checked={endType === 'count'} onChange={handleChange} />
                After
                <FormField 
                  id="recurrence_count" 
                  label="" // Visually hidden label for screen readers if needed via CSS
                  type="number" 
                  value={getString(recurrenceCount)} 
                  onChange={handleChange} 
                  name="recurrence_count"
                  min={1} 
                  disabled={endType !== 'count'} 
                  className="inline-input short-input"
                /> 
                occurrences
              </label>
              <label>
                <input type="radio" name="end_type" value="until" checked={endType === 'until'} onChange={handleChange} />
                On
                <FormField 
                  id="recurrence_end_date" 
                  label="" // Visually hidden label
                  type="date" 
                  value={getString(recurrenceEndDate)} 
                  onChange={handleChange} 
                  name="recurrence_end_date"
                  disabled={endType !== 'until'} 
                  className="inline-input"
                />
              </label>
              <label>
                <input type="radio" name="end_type" value="never" checked={endType === 'never'} onChange={handleChange} />
                Never
              </label>
            </div>
          </div>
          
          {/* Timezone could be added if needed, for now uses default from NewEventFormState or existing event */}
          {/* <FormField id="recurrence_timezone" label="Timezone" value={eventData.recurrence_timezone || ''} onChange={handleChange} name="recurrence_timezone" /> */}

        </div>
      )}
    </div>
  );
};

export default EventFormFields; 