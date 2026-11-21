import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (import.meta.env.PROD) {
  registerSW({immediate: true});
} else if (typeof window !== 'undefined') {
  if ('caches' in window) {
    void caches.keys().then((keys) => {
      keys.forEach((key) => {
        void caches.delete(key);
      });
    });
  }
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      let hasPushSw = false;
      for (const registration of registrations) {
        const scriptUrl =
          registration.active?.scriptURL ||
          registration.waiting?.scriptURL ||
          registration.installing?.scriptURL ||
          '';
        if (scriptUrl.endsWith('/sw-push.js')) {
          hasPushSw = true;
        } else {
          await registration.unregister();
        }
      }
      if (!hasPushSw) {
        await navigator.serviceWorker.register('/sw-push.js', {scope: '/'}).catch(() => undefined);
      }
    });
  }
}

createRoot(document.getElementById('root')!).render(<App />);
