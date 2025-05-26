import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../utils/api';
import Button from '../../components/common/Button';
import Spinner from '../../components/common/Spinner';
import ContactFormModal from '../../components/modals/ContactFormModal';
import { showSuccess, showError } from '../../utils/toastManager';
import '../../styles/pages/_contacts.scss';

interface ContactFormData {
  // Basic Information
  firstName: string;
  middleName: string;
  lastName: string;
  nickname: string;
  
  // Contact Information
  email: string;
  phone: string;
  mobilePhone: string;
  workPhone: string;
  website: string;
  preferredContactMethod: string;
  
  // Professional Information
  company: string;
  jobTitle: string;
  department: string;
  
  // Address Information
  streetAddress: string;
  streetAddress2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  
  // Personal Information
  birthday: string;
  timezone: string;
  language: string;
  notes: string;
  
  // Social Media
  socialLinkedin: string;
  socialTwitter: string;
  
  // Tags (comma-separated string for form input)
  tags: string;
}

interface Contact {
  contact_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  nickname?: string;
  email?: string;
  phone?: string;
  mobile_phone?: string;
  work_phone?: string;
  company?: string;
  job_title?: string;
  department?: string;
  notes?: string;
  birthday?: string;
  website?: string;
  street_address?: string;
  street_address_2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  address?: string;
  social_linkedin?: string;
  social_twitter?: string;
  tags?: string[];
  preferred_contact_method?: string;
  timezone?: string;
  language?: string;
  google_contact_id?: string;
  import_source?: string;
  import_batch_id?: string;
  imported_at?: string;
  normalized_phone?: string;
  formatted_address?: string;
}

interface ContactsResponse {
  contacts: Contact[];
  total: number;
  hasMore: boolean;
}

const ContactsPage: React.FC = () => {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalContacts, setTotalContacts] = useState(0);
  const [_hasMore, setHasMore] = useState(false);

  // Debounced search
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  // Calculate pagination values
  const offset = useMemo(() => (currentPage - 1) * itemsPerPage, [currentPage, itemsPerPage]);
  const totalPages = useMemo(() => Math.ceil(totalContacts / itemsPerPage), [totalContacts, itemsPerPage]);

  // Fetch contacts with pagination
  const fetchContacts = useCallback(async (query: string = '', page: number = currentPage, perPage: number = itemsPerPage) => {
    if (!user) return;
    
    setLoading(true);
    try {
      const calculatedOffset = (page - 1) * perPage;
      const response = await apiClient.post<{
        query: string;
        limit: number;
        offset: number;
        forceRefresh: boolean;
      }, ContactsResponse>('/contacts-search', {
        query,
        limit: perPage,
        offset: calculatedOffset,
        forceRefresh: true
      });
      
      setContacts(response.contacts || []);
      setTotalContacts(response.total || 0);
      setHasMore(response.hasMore || false);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      showError('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [user, currentPage, itemsPerPage]);

  // Debounced search handler
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setCurrentPage(1); // Reset to first page on search
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    const timeout = setTimeout(() => {
      fetchContacts(value);
    }, 300);
    
    setSearchTimeout(timeout);
  }, [searchTimeout, fetchContacts]);

  // Delete contact(s)
  const handleDelete = async (contactIds?: string[]) => {
    const idsToDelete = contactIds || Array.from(selectedContacts);
    if (idsToDelete.length === 0) return;
    
    const message = idsToDelete.length > 1 
      ? `Are you sure you want to delete ${idsToDelete.length} contacts?`
      : 'Are you sure you want to delete this contact?';
      
    if (!confirm(message)) return;
    
    try {
      await Promise.all(
        idsToDelete.map(id => 
          apiClient.post('/contacts', {
            contact_id: id,
            _method: 'DELETE'
          })
        )
      );
      
      showSuccess(`Deleted ${idsToDelete.length} contact${idsToDelete.length > 1 ? 's' : ''}`);
      setSelectedContacts(new Set());
      await fetchContacts(searchQuery);
    } catch (error) {
      console.error('Error deleting contacts:', error);
      showError('Failed to delete contacts');
    }
  };

  // Save contact (add or update) - for ContactFormModal
  const handleSaveContact = async (contactData: ContactFormData) => {
    try {
      if (editingContact) {
        await apiClient.put(`/contacts/${editingContact.contact_id}`, contactData);
        showSuccess('Contact updated successfully');
      } else {
        await apiClient.post('/contacts', contactData);
        showSuccess('Contact added successfully');
      }
      
      setEditingContact(null);
      setShowAddForm(false);
      await fetchContacts(searchQuery);
    } catch (error) {
      console.error('Error saving contact:', error);
      showError('Failed to save contact');
    }
  };

  // Toggle contact selection
  const toggleContactSelection = (contactId: string) => {
    setSelectedContacts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(contactId)) {
        newSet.delete(contactId);
      } else {
        newSet.add(contactId);
      }
      return newSet;
    });
  };

  // Select all contacts
  const selectAllContacts = () => {
    if (selectedContacts.size === contacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(contacts.map(c => c.contact_id)));
    }
  };

  // Get contact display name
  const getContactName = (contact: Contact) => {
    const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    return name || contact.email || contact.phone || 'Unnamed Contact';
  };

  // Get initials for avatar
  const getInitials = (contact: Contact) => {
    const name = getContactName(contact);
    const parts = name.split(' ');
    if (parts.length > 1) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Pagination handlers
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  const goToFirstPage = () => handlePageChange(1);
  const goToLastPage = () => handlePageChange(totalPages);
  const goToPreviousPage = () => handlePageChange(currentPage - 1);
  const goToNextPage = () => handlePageChange(currentPage + 1);

  // Load contacts on mount and pagination changes
  useEffect(() => {
    fetchContacts(searchQuery, currentPage, itemsPerPage);
  }, [fetchContacts, searchQuery, currentPage, itemsPerPage]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTimeout]);

  // Group contacts by first letter
  const groupedContacts = useMemo(() => {
    const groups: Record<string, Contact[]> = {};
    contacts.forEach(contact => {
      const name = getContactName(contact);
      const firstLetter = name[0]?.toUpperCase() || '#';
      if (!groups[firstLetter]) {
        groups[firstLetter] = [];
      }
      groups[firstLetter].push(contact);
    });
    return groups;
  }, [contacts]);

  if (loading && contacts.length === 0) {
    return (
      <div className="contacts-page">
        <div className="loading-container">
          <Spinner />
          <p>Loading your contacts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="contacts-page">
      <h1 className="page-title">Contacts</h1>
      <div className="contacts-header">
        <div className="header-top">
          <div className="header-left">
            <span className="contact-count">
              {totalContacts > 0 ? `${totalContacts} total contacts` : `${contacts.length} contacts`}
            </span>
          </div>
          <div className="header-actions">
            <div className="view-toggle">
                <button 
                  className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="Grid view"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="1" y="1" width="5" height="5" />
                    <rect x="10" y="1" width="5" height="5" />
                    <rect x="1" y="10" width="5" height="5" />
                    <rect x="10" y="10" width="5" height="5" />
                  </svg>
                </button>
                <button 
                  className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                  title="List view"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="1" y="2" width="14" height="2" />
                    <rect x="1" y="7" width="14" height="2" />
                    <rect x="1" y="12" width="14" height="2" />
                  </svg>
                </button>
              </div>
              {selectedContacts.size > 0 && (
                <Button 
                  variant="ghost" 
                  size="small"
                  onClick={() => handleDelete()}
                  className="bulk-actions-btn"
                >
                  Delete ({selectedContacts.size})
                </Button>
              )}
              <Button 
                variant="primary" 
                onClick={() => setShowAddForm(true)}
                className="add-contact-btn"
              >
                <span className="btn-icon">+</span>
                Add Contact
              </Button>
            </div>
          </div>

          {/* Premium Pagination Controls */}
          {totalContacts > 0 && (
            <div className="header-pagination">
              <div className="pagination-left">
                <div className="items-per-page-control">
                  <label>Show:</label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                    className="items-select premium"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="pagination-info">
                    Showing {offset + 1}-{Math.min(offset + itemsPerPage, totalContacts)} of {totalContacts}
                  </span>
                </div>
              </div>
              
              <div className="pagination-right">
                <div className="page-navigation-controls">
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={goToFirstPage}
                    disabled={currentPage === 1}
                    title="First page"
                    className="nav-btn"
                  >
                    ««
                  </Button>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={goToPreviousPage}
                    disabled={currentPage === 1}
                    title="Previous page"
                    className="nav-btn"
                  >
                    ‹
                  </Button>
                  
                  <div className="page-numbers-compact">
                    {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage <= 2) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 1) {
                        pageNum = totalPages - 2 + i;
                      } else {
                        pageNum = currentPage - 1 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={pageNum === currentPage ? "primary" : "ghost"}
                          size="small"
                          onClick={() => handlePageChange(pageNum)}
                          className="page-btn compact"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages}
                    title="Next page"
                    className="nav-btn"
                  >
                    ›
                  </Button>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={goToLastPage}
                    disabled={currentPage === totalPages}
                    title="Last page"
                    className="nav-btn"
                  >
                    »»
                  </Button>
                </div>
              </div>
            </div>
          )}
      </div>

      <div className="search-section">
        <div className="search-wrapper">
          <svg className="search-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M17.5 17.5L13.875 13.875M15.8333 9.16667C15.8333 12.8486 12.8486 15.8333 9.16667 15.8333C5.48477 15.8333 2.5 12.8486 2.5 9.16667C2.5 5.48477 5.48477 2.5 9.16667 2.5C12.8486 2.5 15.8333 5.48477 15.8333 9.16667Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, email, phone, or company..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button 
              className="clear-search"
              onClick={() => handleSearchChange('')}
            >
              ×
            </button>
          )}
        </div>
      </div>

      <ContactFormModal
        isOpen={showAddForm || !!editingContact}
        onClose={() => { setEditingContact(null); setShowAddForm(false); }}
        onSave={handleSaveContact}
        initialData={editingContact ? {
          // Basic Information
          firstName: editingContact.first_name || '',
          middleName: editingContact.middle_name || '',
          lastName: editingContact.last_name || '',
          nickname: editingContact.nickname || '',
          
          // Contact Information
          email: editingContact.email || '',
          phone: editingContact.phone || '',
          mobilePhone: editingContact.mobile_phone || '',
          workPhone: editingContact.work_phone || '',
          website: editingContact.website || '',
          preferredContactMethod: editingContact.preferred_contact_method || '',
          
          // Professional Information
          company: editingContact.company || '',
          jobTitle: editingContact.job_title || '',
          department: editingContact.department || '',
          
          // Address Information
          streetAddress: editingContact.street_address || '',
          streetAddress2: editingContact.street_address_2 || '',
          city: editingContact.city || '',
          stateProvince: editingContact.state_province || '',
          postalCode: editingContact.postal_code || '',
          country: editingContact.country || '',
          
          // Personal Information
          birthday: editingContact.birthday || '',
          timezone: editingContact.timezone || '',
          language: editingContact.language || '',
          notes: editingContact.notes || '',
          
          // Social Media
          socialLinkedin: editingContact.social_linkedin || '',
          socialTwitter: editingContact.social_twitter || '',
          
          // Tags (convert array to comma-separated string)
          tags: editingContact.tags ? editingContact.tags.join(', ') : ''
        } : {}}
        title={editingContact ? 'Edit Contact' : 'New Contact'}
      />

      {selectedContacts.size > 0 && (
        <div className="bulk-actions">
          <label className="select-all">
            <input
              type="checkbox"
              checked={selectedContacts.size === contacts.length}
              onChange={selectAllContacts}
            />
            Select all
          </label>
          <span className="selection-count">
            {selectedContacts.size} selected
          </span>
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="9" cy="7" r="4" strokeWidth="1.5"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h3>No contacts yet</h3>
          <p>Add your first contact to get started</p>
          <Button variant="primary" onClick={() => setShowAddForm(true)}>
            Add Your First Contact
          </Button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="contacts-grid">
          {contacts.map((contact) => (
            <div key={contact.contact_id} className={`contact-card ${selectedContacts.has(contact.contact_id) ? 'selected' : ''}`}>
              <div className="card-header">
                <label className="contact-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedContacts.has(contact.contact_id)}
                    onChange={() => toggleContactSelection(contact.contact_id)}
                  />
                </label>
                <div className="contact-avatar">
                  {getInitials(contact)}
                </div>
                <div className="contact-actions">
                  <button 
                    className="action-btn"
                    onClick={() => setEditingContact(contact)}
                    title="Edit"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M11.5 1.5a1.5 1.5 0 0 1 2.121 0l.879.879a1.5 1.5 0 0 1 0 2.121L5 14l-3.5.5.5-3.5L11.5 1.5z"/>
                    </svg>
                  </button>
                  <button 
                    className="action-btn delete"
                    onClick={() => handleDelete([contact.contact_id])}
                    title="Delete"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2 4h12M5 4V2.5A1.5 1.5 0 0 1 6.5 1h3A1.5 1.5 0 0 1 11 2.5V4m2 0v9.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5V4"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div className="contact-info">
                <div className="contact-name">{getContactName(contact)}</div>
                {contact.company && (
                  <div className="contact-company">{contact.company}</div>
                )}
              </div>
              <div className="contact-details">
                {contact.email && (
                  <div className="detail-item">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M1 3.5L7 7.5L13 3.5M1 10.5V3.5H13V10.5H1Z" stroke="currentColor" strokeWidth="1.2"/>
                    </svg>
                    <span>{contact.email}</span>
                  </div>
                )}
                {contact.phone && (
                  <div className="detail-item">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M8.5 4.5L5.5 1.5L2.5 2.5L3.5 5.5L8.5 10.5L11.5 11.5L12.5 8.5L9.5 5.5" stroke="currentColor" strokeWidth="1.2"/>
                    </svg>
                    <span>{contact.phone}</span>
                  </div>
                )}
                {contact.job_title && (
                  <div className="detail-item">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M10 4V2.5A1.5 1.5 0 0 0 8.5 1h-3A1.5 1.5 0 0 0 4 2.5V4M1 12.5V5.5A1.5 1.5 0 0 1 2.5 4h9A1.5 1.5 0 0 1 13 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 1 12.5z" stroke="currentColor" strokeWidth="1.2"/>
                    </svg>
                    <span>{contact.job_title}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="contacts-list">
          {Object.entries(groupedContacts).sort().map(([letter, letterContacts]) => (
            <div key={letter} className="letter-group">
              <div className="letter-header">{letter}</div>
              {letterContacts.map((contact) => (
                <div key={contact.contact_id} className={`list-item ${selectedContacts.has(contact.contact_id) ? 'selected' : ''}`}>
                  <label className="contact-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedContacts.has(contact.contact_id)}
                      onChange={() => toggleContactSelection(contact.contact_id)}
                    />
                  </label>
                  <div className="contact-avatar small">
                    {getInitials(contact)}
                  </div>
                  <div className="contact-info">
                    <div className="contact-name">{getContactName(contact)}</div>
                    <div className="contact-meta">
                      {[contact.company, contact.job_title, contact.email, contact.phone]
                        .filter(Boolean)
                        .join(' • ')}
                    </div>
                  </div>
                  <div className="contact-actions">
                    <button 
                      className="action-btn"
                      onClick={() => setEditingContact(contact)}
                      title="Edit"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M11.5 1.5a1.5 1.5 0 0 1 2.121 0l.879.879a1.5 1.5 0 0 1 0 2.121L5 14l-3.5.5.5-3.5L11.5 1.5z"/>
                      </svg>
                    </button>
                    <button 
                      className="action-btn delete"
                      onClick={() => handleDelete([contact.contact_id])}
                      title="Delete"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M2 4h12M5 4V2.5A1.5 1.5 0 0 1 6.5 1h3A1.5 1.5 0 0 1 11 2.5V4m2 0v9.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5V4"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContactsPage;