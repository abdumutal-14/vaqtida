import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../Vaqtida.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service Worker'ni ro'yxatdan o'tkazish (PWA + Web Push)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn('Service Worker ro\'yxatdan o\'tmadi:', e);
    });
  });
}
