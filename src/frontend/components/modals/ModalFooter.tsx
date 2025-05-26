import React from 'react';

export interface ModalFooterProps {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right' | 'space-between';
}

const ModalFooter: React.FC<ModalFooterProps> = ({
  children,
  className = '',
  align = 'right'
}) => {
  const alignmentClass = align === 'space-between' ? 'footer-space-between' :
                        align === 'center' ? 'footer-center' :
                        align === 'left' ? 'footer-left' : '';
  
  const footerClass = `modal-footer ${alignmentClass} ${className}`.trim();
  
  return (
    <div className={footerClass}>
      {children}
    </div>
  );
};

export default ModalFooter; 