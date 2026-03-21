import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from './ui/button';

export const BackToTop = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.pageYOffset > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);

    return () => {
      window.removeEventListener('scroll', toggleVisibility);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  return (
    <>
      {isVisible && (
        <Button
          onClick={scrollToTop}
          className="fixed bottom-4 md:bottom-[112px] right-4 md:right-6 z-50 w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 shadow-2xl transition-all duration-300 hover:scale-110 flex items-center justify-center p-1.5 animate-fade-in-right"
          size="icon"
        >
          <ArrowUp className="w-5 h-5 md:w-6 md:h-6 text-white" strokeWidth={2.5} />
        </Button>
      )}
    </>
  );
};