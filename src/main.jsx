import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Reset browser defaults
const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { line-height: 1.5; -webkit-font-smoothing: antialiased; background: #f5f3f0; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #d4d0ca; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #b0adb8; }
  input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.4; cursor: pointer; }
  input[type="time"]::-webkit-calendar-picker-indicator { opacity: 0.4; cursor: pointer; }
  select option { background: #ffffff; color: #2d2b38; }
  button:focus-visible { outline: 2px solid #8b7cf6; outline-offset: 2px; }
  input:focus, textarea:focus, select:focus { border-color: #c4bbf0 !important; box-shadow: 0 0 0 3px rgba(139,124,246,0.12); }
`;
document.head.appendChild(style);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
