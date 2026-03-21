import React, { createContext, useContext, useState, ReactNode } from 'react';

interface CartVisibilityContextType {
  isCartOpen: boolean;
  setIsCartOpen: (isOpen: boolean) => void;
}

const CartVisibilityContext = createContext<CartVisibilityContextType | undefined>(undefined);

export const CartVisibilityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isCartOpen, setIsCartOpen] = useState(false);

  return (
    <CartVisibilityContext.Provider value={{ isCartOpen, setIsCartOpen }}>
      {children}
    </CartVisibilityContext.Provider>
  );
};

export const useCartVisibility = () => {
  const context = useContext(CartVisibilityContext);
  if (!context) {
    // During HMR, return safe default instead of throwing
    if (import.meta.hot) {
      console.warn('⚠️ useCartVisibility called during HMR before CartVisibilityProvider is ready');
      return {
        isCartOpen: false,
        setIsCartOpen: () => {},
      };
    }
    throw new Error('useCartVisibility must be used within CartVisibilityProvider');
  }
  return context;
};