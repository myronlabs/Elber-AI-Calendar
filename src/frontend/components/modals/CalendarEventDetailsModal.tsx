import React, { useState } from 'react';
import Modal from './Modal';
import ModalHeader from './ModalHeader';
import ModalBody from './ModalBody';
import ModalFooter from './ModalFooter';
import { RecurringCalendarEvent } from '../../types/recurrence';
import { formatDate } from '../../utils/helpers';
import { linkifyText } from '../../utils/urlUtils';
import Button from '../common/Button';

interface CalendarEventDetailsModalProps {
  event: RecurringCalendarEvent;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (event: RecurringCalendarEvent) => void;
  onDelete: (id: string) => void;
  userTimezone: string;
}

// Helper function to format time from datetime string
const formatTime = (timeString: string): string => {
  try {
    const date = new Date(timeString);
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  } catch (error) {
    console.error('Error formatting time:', timeString, error);
    return 'Invalid Time';
  }
};

const CalendarEventDetailsModal: React.FC<CalendarEventDetailsModalProps> = ({
  event,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  userTimezone
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    onDelete(event.event_id);
    onClose();
  };

  const handleEdit = () => {
    onEdit(event);
    onClose();
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} className="event-details-modal">
        <ModalHeader 
          title={event.title}
          onClose={onClose}
        />

        <ModalBody>
          {event.description && (
            <div className="event-field">
              <label>Description</label>
              <p>{linkifyText(event.description)}</p>
            </div>
          )}

          <div className="event-field">
            <label>Date</label>
            <p>{formatDate(event.start_time, { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}</p>
          </div>

          <div className="event-field">
            <label>Time</label>
            <p>
              {formatTime(event.start_time)} - {formatTime(event.end_time)}
              {userTimezone && <span className="timezone"> ({userTimezone})</span>}
            </p>
          </div>

          {event.location && (
            <div className="event-field">
              <label>Location</label>
              <p>{linkifyText(event.location)}</p>
            </div>
          )}

          {event.is_recurring && (
            <div className="event-field">
              <label>Recurrence</label>
              <p>This is a recurring event</p>
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="outline" onClick={handleEdit}>
            Edit
          </Button>
          <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
            Delete
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} className="confirm-modal modal-warning">
        <ModalHeader 
          title="Delete Event"
          onClose={() => setShowDeleteConfirm(false)}
        />
        
        <ModalBody>
          <p>Are you sure you want to delete &ldquo;{event.title}&rdquo;?</p>
          {event.is_recurring && (
            <p className="warning-text">This is a recurring event. All occurrences will be deleted.</p>
          )}
        </ModalBody>
        
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default CalendarEventDetailsModal;