import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
// The static splash in index.html covers the cold-load gap; drop it explicitly rather than
// relying on createRoot to clear the container, which is not part of React's contract.
document.getElementById('boot')?.remove();
createRoot(document.getElementById('root')!).render(<App />);
