'use client';

import { useState, useEffect } from 'react';

export default function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      setIsVisible(window.scrollY > 300);
    };

    toggleVisibility();
    window.addEventListener('scroll', toggleVisibility, { passive: true });
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      className="global-scroll-to-top fixed bottom-6 right-6 md:bottom-10 md:right-10 p-3 rounded-full shadow-xl transition-all duration-300 z-50 hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-[#7ba8f0]"
      style={{
        backgroundColor: 'var(--card-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-lg)'
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
