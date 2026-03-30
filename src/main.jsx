import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Reset browser defaults
const style = document.createElement('style');
style.textContent = `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } body { line-height: 1.5; -webkit-font-smoothing: antialiased; }`;
document.head.appendChild(style);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
