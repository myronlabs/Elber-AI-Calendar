// src/frontend/components/Button.tsx
import React, { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'outline-subtle' | 'ghost' | 'link';
  size?: 'small' | 'medium' | 'large';
  isLoading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode; // Optional icon to display before text
  iconPosition?: 'left' | 'right'; // Position of the icon
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'medium',
  isLoading = false,
  fullWidth = false,
  disabled,
  className = '',
  icon,
  iconPosition = 'left',
  ...props
}) => {
  // Generate the CSS classes based on props
  const buttonVariantClass = (() => {
    switch (variant) {
      case 'primary': return 'btn-primary';
      case 'secondary': return 'btn-secondary';
      case 'danger': return 'btn-danger';
      case 'outline': return 'btn-outline-primary';
      case 'outline-subtle': return 'btn-outline-subtle';
      case 'ghost': return 'btn-ghost';
      case 'link': return 'btn-link';
      default: return 'btn-primary';
    }
  })();

  const sizeClass = (() => {
    switch (size) {
      case 'small': return 'btn-sm';
      case 'large': return 'btn-lg';
      default: return '';
    }
  })();

  const classes = [
    'btn',
    buttonVariantClass,
    sizeClass,
    isLoading ? 'btn-loading' : '',
    fullWidth ? 'btn-full-width' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button" // Default to button type for accessibility unless overridden
      className={classes}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <span className="spinner" aria-hidden="true">
          <svg 
            style={{ width: '1em', height: '1em' }} 
            fill="none" 
            viewBox="0 0 24 24"
          >
            <circle 
              style={{ opacity: 0.25 }} 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="4"
            ></circle>
            <path 
              style={{ opacity: 0.75 }} 
              fill="currentColor" 
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        </span>
      )}
      
      {/* Icon on the left if specified */}
      {icon && iconPosition === 'left' && !isLoading && (
        <span className="button-icon button-icon-left" aria-hidden="true">
          {icon}
        </span>
      )}
      
      {/* Button text */}
      <span className="button-text">{children}</span>
      
      {/* Icon on the right if specified */}
      {icon && iconPosition === 'right' && (
        <span className="button-icon button-icon-right" aria-hidden="true">
          {icon}
        </span>
      )}
    </button>
  );
};

export default Button;