import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-neutral-800 text-neutral-200 p-4 text-center"> {/* Example neutral colors */}
      <div className="container mx-auto">
        <p>&copy; {new Date().getFullYear()} JCI Oriente. Todos los derechos reservados.</p>
        {/* Add social media links, contact info etc. */}
      </div>
    </footer>
  );
};

export default Footer;