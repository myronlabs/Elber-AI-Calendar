// src/frontend/hooks/useFormValidation.ts
import { useState, useCallback } from 'react';

/**
 * Generic interface for a validation schema
 * TData is the form data type
 * This allows each field to have a custom validation function
 */
export interface ValidationSchema<TData extends Record<string, unknown>> {
   
  [key: string]: (_fieldValue: unknown, _formValues: TData) => string | null;
}

/**
 * Interface for the form state
 * TData is the form data type that will determine the shape of the errors object
 */
export interface FormState<TData extends Record<string, unknown>> {
  formData: TData;
  errors: Record<keyof TData, string>;
  isSubmitting: boolean;
  isValid: boolean;
  touchedFields: Set<keyof TData>;
}

/**
 * Hook for form validation
 * @param initialData - Initial form data
 * @param validationSchema - Schema with validation functions for each field
 * @returns Form state and utility functions for managing the form
 */
export function useFormValidation<TData extends Record<string, unknown>>(
  initialData: TData,
  validationSchema: ValidationSchema<TData>
) {
  // Initialize form state
  const [formState, setFormState] = useState<FormState<TData>>({
    formData: initialData,
    errors: Object.keys(initialData).reduce((acc, key) => {
      acc[key as keyof TData] = '';
      return acc;
    }, {} as Record<keyof TData, string>),
    isSubmitting: false,
    isValid: true,
    touchedFields: new Set<keyof TData>()
  });

  /**
   * Validates a single field
   * @param field - The field to validate
   * @param value - The value to validate
   * @returns Error message or null if valid
   */
  const validateField = useCallback(
    (field: keyof TData, value: unknown): string => {
      // Check if the field has a validation function
      const validator = validationSchema[field as string];
      if (!validator) return '';

      // Run the validation function
      const error = validator(value, formState.formData);
      return error || '';
    },
    [validationSchema, formState.formData]
  );

  /**
   * Validates all fields in the form
   * @returns True if the form is valid, false otherwise
   */
  const validateForm = useCallback((): boolean => {
    const newErrors = { ...formState.errors };
    let formIsValid = true;

    // Validate each field
    Object.keys(formState.formData).forEach((key) => {
      const field = key as keyof TData;
      const value = formState.formData[field];
      const error = validateField(field, value);

      newErrors[field] = error;
      if (error) {
        formIsValid = false;
      }
    });

    // Update errors state
    setFormState(prev => ({
      ...prev,
      errors: newErrors,
      isValid: formIsValid
    }));

    return formIsValid;
  }, [formState.errors, formState.formData, validateField]);

  /**
   * Handles changes to form fields
   * @param field - The field that changed
   * @param value - The new value
   */
  const handleChange = useCallback(
    (field: keyof TData, value: unknown) => {
      // Update form data
      const newFormData = {
        ...formState.formData,
        [field]: value
      };

      // Mark field as touched
      const newTouchedFields = new Set(formState.touchedFields);
      newTouchedFields.add(field);

      // Validate the field
      const error = validateField(field, value);
      const newErrors = {
        ...formState.errors,
        [field]: error
      };

      // Check if the whole form is valid
      const isValid = Object.values(newErrors).every(err => !err);

      // Update form state
      setFormState(prev => ({
        ...prev,
        formData: newFormData,
        errors: newErrors,
        isValid,
        touchedFields: newTouchedFields
      }));
    },
    [formState, validateField]
  );

  /**
   * Handles form submission
   * @param onValid - Callback function to execute if the form is valid
   * @returns A submission handler function
   */
  const handleSubmit = useCallback(
     
    (onValid: (_validFormData: TData) => Promise<void> | void) => {
      return async (e: React.FormEvent) => {
        e.preventDefault();

        // Set submitting state
        setFormState(prev => ({
          ...prev,
          isSubmitting: true
        }));

        // Validate all fields
        const isValid = validateForm();

        if (isValid) {
          try {
            await onValid(formState.formData);
          } catch (error) {
            console.error('Form submission error:', error);
          }
        }

        // Reset submitting state
        setFormState(prev => ({
          ...prev,
          isSubmitting: false
        }));
      };
    },
    [formState.formData, validateForm]
  );

  /**
   * Resets the form to its initial state
   */
  const resetForm = useCallback(() => {
    setFormState({
      formData: initialData,
      errors: Object.keys(initialData).reduce((acc, key) => {
        acc[key as keyof TData] = '';
        return acc;
      }, {} as Record<keyof TData, string>),
      isSubmitting: false,
      isValid: true,
      touchedFields: new Set<keyof TData>()
    });
  }, [initialData]);

  /**
   * Sets form data with optional validation
   * @param newData - New form data
   * @param shouldValidate - Whether to validate the form after setting the data
   */
  const setFormData = useCallback(
    (newData: Partial<TData>, shouldValidate = false) => {
      const updatedData = { ...formState.formData, ...newData };

      setFormState(prev => ({
        ...prev,
        formData: updatedData
      }));

      if (shouldValidate) {
        validateForm();
      }
    },
    [formState.formData, validateForm]
  );

  /**
   * Sets the submitting state
   * @param isSubmitting - Whether the form is submitting
   */
  const setSubmitting = useCallback((isSubmitting: boolean) => {
    setFormState(prev => ({
      ...prev,
      isSubmitting
    }));
  }, []);

  return {
    formState,
    handleChange,
    handleSubmit,
    validateForm,
    resetForm,
    setFormData,
    setSubmitting
  };
}