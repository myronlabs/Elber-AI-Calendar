// src/frontend/components/FormField.tsx
import React from 'react';

interface FormFieldProps {
  id: string;
  label: string;
  name?: string;
  value: string | number; // Allow number for type="number"
  /** Event handler for input changes
   * @param _event - The change event
   */
   
  onChange: (_event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void; // Updated to include HTMLTextAreaElement and HTMLSelectElement
  type?: string; // Default is 'text', can be 'textarea', 'number', 'date', 'time', 'email', 'password', 'url', 'tel'
  placeholder?: string;
  required?: boolean;
  error?: string;
  autoComplete?: string;
  className?: string;
  rows?: number; // For textarea
  min?: string | number; // For number/date inputs
  max?: string | number; // For number/date inputs
  checked?: boolean; // For checkbox/radio (though this component is more for text-like inputs)
  disabled?: boolean;
  // Support for select specific props if we extend further, or children for options
  children?: React.ReactNode; // For <select> options if type is 'select'
}

const FormField: React.FC<FormFieldProps> = ({
  id,
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
  error,
  autoComplete,
  className = '',
  rows = 3, // Default rows for textarea
  min,
  max,
  checked,
  disabled = false,
  children
}) => {
  // Determine if the field has an error
  const hasError = !!error;
  // Construct CSS classes
  const baseInputClasses = 'form-input-base'; // Add a common base class for styling if needed
  const inputClasses = `${baseInputClasses} ${hasError ? 'input-error' : ''} ${className}`.trim();

  const labelElement = (
    <label htmlFor={id}>
      {label}
      {required && <span className="required-indicator">*</span>}
    </label>
  );

  let inputElement;
  if (type === 'textarea') {
    inputElement = (
      <textarea
        id={id}
        name={name}
        value={value as string} // textarea value is always string
        onChange={onChange as (_event: React.ChangeEvent<HTMLTextAreaElement>) => void}
        placeholder={placeholder}
        required={required}
        className={inputClasses}
        rows={rows}
        disabled={disabled}
      />
    );
  } else if (type === 'select') {
    inputElement = (
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange as (_event: React.ChangeEvent<HTMLSelectElement>) => void}
        required={required}
        className={inputClasses}
        disabled={disabled}
      >
        {children}
      </select>
    );
  } else {
    inputElement = (
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange as (_event: React.ChangeEvent<HTMLInputElement>) => void}
        placeholder={placeholder}
        required={required}
        className={inputClasses}
        autoComplete={autoComplete}
        min={min}
        max={max}
        checked={type === 'checkbox' || type === 'radio' ? checked : undefined}
        disabled={disabled}
      />
    );
  }

  return (
    <div className={`form-group type-${type}`}>
      {labelElement}
      {inputElement}
      {hasError && <span className="field-error">{error}</span>}
    </div>
  );
};

export default FormField;