import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

const Layout: React.FC = () => {
  useEffect(() => {
    // Add smooth scroll behavior
    document.documentElement.style.scrollBehavior = 'smooth';

    // Optional: Remove smooth scroll on cleanup
    return () => {
      document.documentElement.style.scrollBehavior = 'auto';
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="animate-fade-in w-full flex-grow pt-16">
        <Outlet /> {/* Page content will be rendered here */}
      </main>
      <Footer />
    </div>
  );
};

export default Layout;
