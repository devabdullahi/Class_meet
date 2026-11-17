/**
 * React entry point.
 *
 * Nothing to wait for before the first render: students sign in with an
 * emailed code, and MSAL — needed only if the server turns Microsoft sign-in
 * on — is loaded on demand by AuthProvider rather than here.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource-variable/inter/wght.css';
import './styles.css';
import './screens.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('index.html is missing <div id="root">.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
