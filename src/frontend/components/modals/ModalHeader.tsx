import React from 'react';

export interface ModalHeaderProps {
  title?: string;
  subtitle?: string;
  onClose?: () => void;
  showCloseButton?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const ModalHeader: React.FC<ModalHeaderProps> = ({
  title,
  subtitle,
  onClose,
  showCloseButton = true,
  className = '',
  children
}) => {
  return (
    <div className={`modal-header ${className}`}>
      <div className="modal-header-content">
        {title && <h2 className="modal-title">{title}</h2>}
        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
        {children}
      </div>
      {showCloseButton && onClose && (
        <button 
          className="modal-close-button" 
          onClick={onClose} 
          aria-label="Close modal"
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path 
              d="M15 5L5 15M5 5L15 15" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
            />
          </svg>
        </button>
      )}
    </div>
  );
};

export default ModalHeader; 