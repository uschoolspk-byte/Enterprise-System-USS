import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { DEFAULT_LOGO_URL } from './lib/brandingAssets';

function applyAppIcons() {
  for (const rel of ['icon', 'apple-touch-icon'] as const) {
    let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = DEFAULT_LOGO_URL;
  }
}

applyAppIcons();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
