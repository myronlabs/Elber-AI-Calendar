// src/frontend/components/StandardToastContainer.tsx
import React from 'react';
import { ToastContainer, Slide } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

/**
 * Standardized ToastContainer component to maintain consistent toast styling
 * across the application. Works with the centralized toast manager for
 * proper queuing and spacing.
 */
const StandardToastContainer: React.FC = () => {
  return (
    <ToastContainer
      position="top-center"
      autoClose={2000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="dark"
      limit={4} // Allow up to 4 toasts but with smart queuing
      style={{ 
        zIndex: 9999,
        top: '1rem',
        width: '90%',
        maxWidth: '420px'
      }}
      // Use Slide transition for smoother animations
      transition={Slide}
      // Prevent toasts from stacking on top of each other
      containerId="main-toast-container"
    />
  );
};

export default StandardToastContainer;