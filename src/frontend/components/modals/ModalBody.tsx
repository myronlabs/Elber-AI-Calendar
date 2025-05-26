import React from 'react';

export interface ModalBodyProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

const ModalBody: React.FC<ModalBodyProps> = ({
  children,
  className = '',
  noPadding = false
}) => {
  const bodyClass = `modal-body ${noPadding ? 'no-padding' : ''} ${className}`.trim();
  
  return (
    <div className={bodyClass}>
      {children}
    </div>
  );
};

export default ModalBody; 