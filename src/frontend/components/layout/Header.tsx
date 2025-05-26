// src/frontend/components/Header.tsx
import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom'; 
import '../../styles/components/_header.scss'; 
import { useAuth } from '../../context/AuthContext';

const Header: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleLogout = async () => {
    try {
      console.log('[Header] Initiating logout process');
      // First clean up any local UI state
      setIsMobileMenuOpen(false);

      // Then perform the sign out operation
      await signOut();

      // Navigate after signOut completes
      console.log('[Header] Logout successful, navigating to login page');
      navigate('/login');
    } catch (error) {
      console.error('[Header] Logout error:', error);
      // Ensure we still navigate to login even on error
      navigate('/login');
    }
  };

  // Function to determine NavLink className
  const getNavLinkClassName = ({ isActive }: { isActive: boolean }): string => {
    let classes = 'site-header__nav-link';
    if (isActive) {
      classes += ' site-header__nav-link--active';
    }
    return classes;
  };

  return (
    <header className="site-header">
      <NavLink to="/assistant" className="site-header__logo">
        Elber
      </NavLink>

      <button 
        className={`site-header__hamburger-menu ${isMobileMenuOpen ? 'is-active' : ''}`}
        onClick={toggleMobileMenu}
        aria-label="Toggle navigation"
        aria-expanded={isMobileMenuOpen}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <nav className={`site-header__nav ${isMobileMenuOpen ? 'site-header__nav--mobile-open' : ''}`}>
        {/* <NavLink to="/" className={getNavLinkClassName} onClick={isMobileMenuOpen ? toggleMobileMenu : undefined}>
          Home
        </NavLink> */} {/* Home is typically handled by the logo link */}
        {user ? (
          <>
            <NavLink to="/assistant" className={getNavLinkClassName} onClick={isMobileMenuOpen ? toggleMobileMenu : undefined}>
              Assistant
            </NavLink>
            <NavLink to="/calendar" className={getNavLinkClassName} onClick={isMobileMenuOpen ? toggleMobileMenu : undefined}>
              Calendar
            </NavLink>
            <NavLink to="/contacts" className={getNavLinkClassName} onClick={isMobileMenuOpen ? toggleMobileMenu : undefined}>
              Contacts
            </NavLink>
            <NavLink to="/alerts" className={getNavLinkClassName} onClick={isMobileMenuOpen ? toggleMobileMenu : undefined}>
              Alerts
            </NavLink>
            <NavLink to="/settings" className={getNavLinkClassName} onClick={isMobileMenuOpen ? toggleMobileMenu : undefined}>
              Settings
            </NavLink>
            <button
              type="button"
              className="site-header__logout-btn"
              aria-label="Logout from your account"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleLogout();
                if (isMobileMenuOpen) toggleMobileMenu();
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <NavLink to="/login" className={getNavLinkClassName} onClick={isMobileMenuOpen ? toggleMobileMenu : undefined}>
            Login
          </NavLink>
        )}
      </nav>
    </header>
  );
};

export default Header;
