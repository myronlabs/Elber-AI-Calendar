import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import ModalHeader from './ModalHeader';
import ModalBody from './ModalBody';
import ModalFooter from './ModalFooter';
import Button from '../common/Button';

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

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (contactData: ContactFormData) => void;
  initialData?: Partial<ContactFormData>;
  title?: string;
  isLoading?: boolean;
}

const ContactFormModal: React.FC<ContactFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData = {},
  title = 'Edit Contact',
  isLoading = false
}) => {
  const [formData, setFormData] = useState<ContactFormData>({
    // Basic Information
    firstName: initialData.firstName || '',
    middleName: initialData.middleName || '',
    lastName: initialData.lastName || '',
    nickname: initialData.nickname || '',
    
    // Contact Information
    email: initialData.email || '',
    phone: initialData.phone || '',
    mobilePhone: initialData.mobilePhone || '',
    workPhone: initialData.workPhone || '',
    website: initialData.website || '',
    preferredContactMethod: initialData.preferredContactMethod || 'Not specified',
    
    // Professional Information
    company: initialData.company || '',
    jobTitle: initialData.jobTitle || '',
    department: initialData.department || '',
    
    // Address Information
    streetAddress: initialData.streetAddress || '',
    streetAddress2: initialData.streetAddress2 || '',
    city: initialData.city || '',
    stateProvince: initialData.stateProvince || '',
    postalCode: initialData.postalCode || '',
    country: initialData.country || '',
    
    // Personal Information
    birthday: initialData.birthday || '',
    timezone: initialData.timezone || '',
    language: initialData.language || '',
    notes: initialData.notes || '',
    
    // Social Media
    socialLinkedin: initialData.socialLinkedin || '',
    socialTwitter: initialData.socialTwitter || '',
    
    // Tags
    tags: initialData.tags || ''
  });

  // Update form data when initialData changes (when a different contact is selected)
  useEffect(() => {
    setFormData({
      // Basic Information
      firstName: initialData.firstName || '',
      middleName: initialData.middleName || '',
      lastName: initialData.lastName || '',
      nickname: initialData.nickname || '',
      
      // Contact Information
      email: initialData.email || '',
      phone: initialData.phone || '',
      mobilePhone: initialData.mobilePhone || '',
      workPhone: initialData.workPhone || '',
      website: initialData.website || '',
      preferredContactMethod: initialData.preferredContactMethod || 'Not specified',
      
      // Professional Information
      company: initialData.company || '',
      jobTitle: initialData.jobTitle || '',
      department: initialData.department || '',
      
      // Address Information
      streetAddress: initialData.streetAddress || '',
      streetAddress2: initialData.streetAddress2 || '',
      city: initialData.city || '',
      stateProvince: initialData.stateProvince || '',
      postalCode: initialData.postalCode || '',
      country: initialData.country || '',
      
      // Personal Information
      birthday: initialData.birthday || '',
      timezone: initialData.timezone || '',
      language: initialData.language || '',
      notes: initialData.notes || '',
      
      // Social Media
      socialLinkedin: initialData.socialLinkedin || '',
      socialTwitter: initialData.socialTwitter || '',
      
      // Tags
      tags: initialData.tags || ''
    });
  }, [initialData]);

  const handleInputChange = (field: keyof ContactFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = () => {
    onSave(formData);
  };

  const handleCancel = () => {
    // Reset form data to initial values
    setFormData({
      // Basic Information
      firstName: initialData.firstName || '',
      middleName: initialData.middleName || '',
      lastName: initialData.lastName || '',
      nickname: initialData.nickname || '',
      
      // Contact Information
      email: initialData.email || '',
      phone: initialData.phone || '',
      mobilePhone: initialData.mobilePhone || '',
      workPhone: initialData.workPhone || '',
      website: initialData.website || '',
      preferredContactMethod: initialData.preferredContactMethod || 'Not specified',
      
      // Professional Information
      company: initialData.company || '',
      jobTitle: initialData.jobTitle || '',
      department: initialData.department || '',
      
      // Address Information
      streetAddress: initialData.streetAddress || '',
      streetAddress2: initialData.streetAddress2 || '',
      city: initialData.city || '',
      stateProvince: initialData.stateProvince || '',
      postalCode: initialData.postalCode || '',
      country: initialData.country || '',
      
      // Personal Information
      birthday: initialData.birthday || '',
      timezone: initialData.timezone || '',
      language: initialData.language || '',
      notes: initialData.notes || '',
      
      // Social Media
      socialLinkedin: initialData.socialLinkedin || '',
      socialTwitter: initialData.socialTwitter || '',
      
      // Tags
      tags: initialData.tags || ''
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} className="contact-form-modal modal-size-medium">
      <ModalHeader 
        title={title}
        onClose={handleCancel}
      />

      <ModalBody>
        <div className="form-section">
          <h3 className="section-title">Basic Information</h3>
          
          <div className="form-row">
            <div className="form-field">
              <label className="field-label">First Name *</label>
              <input
                type="text"
                className="field-input"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                placeholder="Enter first name"
                required
              />
            </div>
            <div className="form-field">
              <label className="field-label">Middle Name</label>
              <input
                type="text"
                className="field-input"
                value={formData.middleName}
                onChange={(e) => handleInputChange('middleName', e.target.value)}
                placeholder="Enter middle name"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label className="field-label">Last Name</label>
              <input
                type="text"
                className="field-input"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                placeholder="Enter last name"
              />
            </div>
            <div className="form-field">
              <label className="field-label">Nickname</label>
              <input
                type="text"
                className="field-input"
                value={formData.nickname}
                onChange={(e) => handleInputChange('nickname', e.target.value)}
                placeholder="Enter nickname"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="section-title">Contact Information</h3>
          
          <div className="form-row">
            <div className="form-field">
              <label className="field-label">Email</label>
              <input
                type="email"
                className="field-input"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="Enter email address"
              />
            </div>
            <div className="form-field">
              <label className="field-label">Phone</label>
              <input
                type="tel"
                className="field-input"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="Enter phone number"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label className="field-label">Mobile Phone</label>
              <input
                type="tel"
                className="field-input"
                value={formData.mobilePhone}
                onChange={(e) => handleInputChange('mobilePhone', e.target.value)}
                placeholder="Enter mobile phone"
              />
            </div>
            <div className="form-field">
              <label className="field-label">Work Phone</label>
              <input
                type="tel"
                className="field-input"
                value={formData.workPhone}
                onChange={(e) => handleInputChange('workPhone', e.target.value)}
                placeholder="Enter work phone"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label className="field-label">Website</label>
              <input
                type="url"
                className="field-input"
                value={formData.website}
                onChange={(e) => handleInputChange('website', e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="form-field">
              <label className="field-label">Preferred Contact Method</label>
              <select
                className="field-input"
                value={formData.preferredContactMethod}
                onChange={(e) => handleInputChange('preferredContactMethod', e.target.value)}
              >
                <option value="Not specified">Not specified</option>
                <option value="Email">Email</option>
                <option value="Phone">Phone</option>
                <option value="Mobile">Mobile</option>
                <option value="Work Phone">Work Phone</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="section-title">Professional</h3>
          
          <div className="form-row">
            <div className="form-field">
              <label className="field-label">Company</label>
              <input
                type="text"
                className="field-input"
                value={formData.company}
                onChange={(e) => handleInputChange('company', e.target.value)}
                placeholder="Enter company name"
              />
            </div>
            <div className="form-field">
              <label className="field-label">Job Title</label>
              <input
                type="text"
                className="field-input"
                value={formData.jobTitle}
                onChange={(e) => handleInputChange('jobTitle', e.target.value)}
                placeholder="Enter job title"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label className="field-label">Department</label>
              <input
                type="text"
                className="field-input"
                value={formData.department}
                onChange={(e) => handleInputChange('department', e.target.value)}
                placeholder="Enter department"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="section-title">Address</h3>
          
          <div className="form-row">
            <div className="form-field">
              <label className="field-label">Street Address</label>
              <input
                type="text"
                className="field-input"
                value={formData.streetAddress}
                onChange={(e) => handleInputChange('streetAddress', e.target.value)}
                placeholder="Enter street address"
              />
            </div>
            <div className="form-field">
              <label className="field-label">Street Address 2</label>
              <input
                type="text"
                className="field-input"
                value={formData.streetAddress2}
                onChange={(e) => handleInputChange('streetAddress2', e.target.value)}
                placeholder="Apt, suite, etc."
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label className="field-label">City</label>
              <input
                type="text"
                className="field-input"
                value={formData.city}
                onChange={(e) => handleInputChange('city', e.target.value)}
                placeholder="Enter city"
              />
            </div>
            <div className="form-field">
              <label className="field-label">State/Province</label>
              <input
                type="text"
                className="field-input"
                value={formData.stateProvince}
                onChange={(e) => handleInputChange('stateProvince', e.target.value)}
                placeholder="Enter state or province"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label className="field-label">Postal Code</label>
              <input
                type="text"
                className="field-input"
                value={formData.postalCode}
                onChange={(e) => handleInputChange('postalCode', e.target.value)}
                placeholder="Enter postal code"
              />
            </div>
            <div className="form-field">
              <label className="field-label">Country</label>
              <input
                type="text"
                className="field-input"
                value={formData.country}
                onChange={(e) => handleInputChange('country', e.target.value)}
                placeholder="Enter country"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="section-title">Personal Information</h3>
          
          <div className="form-row">
            <div className="form-field">
              <label className="field-label">Birthday</label>
              <input
                type="date"
                className="field-input"
                value={formData.birthday}
                onChange={(e) => handleInputChange('birthday', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="field-label">Timezone</label>
              <select
                className="field-input"
                value={formData.timezone}
                onChange={(e) => handleInputChange('timezone', e.target.value)}
              >
                <option value="">Select timezone</option>
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label className="field-label">Language</label>
              <select
                className="field-input"
                value={formData.language}
                onChange={(e) => handleInputChange('language', e.target.value)}
              >
                <option value="">Select language</option>
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Italian">Italian</option>
                <option value="Portuguese">Portuguese</option>
                <option value="Chinese">Chinese</option>
                <option value="Japanese">Japanese</option>
                <option value="Korean">Korean</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-field full-width">
              <label className="field-label">Notes</label>
              <textarea
                className="field-input"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Enter any additional notes"
                rows={3}
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="section-title">Social Media</h3>
          
          <div className="form-row">
            <div className="form-field">
              <label className="field-label">LinkedIn</label>
              <input
                type="url"
                className="field-input"
                value={formData.socialLinkedin}
                onChange={(e) => handleInputChange('socialLinkedin', e.target.value)}
                placeholder="https://linkedin.com/in/username"
              />
            </div>
            <div className="form-field">
              <label className="field-label">Twitter</label>
              <input
                type="url"
                className="field-input"
                value={formData.socialTwitter}
                onChange={(e) => handleInputChange('socialTwitter', e.target.value)}
                placeholder="https://twitter.com/username"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="section-title">Tags</h3>
          
          <div className="form-row">
            <div className="form-field full-width">
              <label className="field-label">Tags</label>
              <input
                type="text"
                className="field-input"
                value={formData.tags}
                onChange={(e) => handleInputChange('tags', e.target.value)}
                placeholder="Enter tags separated by commas (e.g., client, vendor, friend)"
              />
            </div>
          </div>
        </div>
      </ModalBody>

      <ModalFooter align="space-between">
        <Button variant="ghost" onClick={handleCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button 
          variant="primary" 
          onClick={handleSave} 
          isLoading={isLoading}
          disabled={!formData.firstName.trim()}
        >
          Save Changes
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default ContactFormModal; 