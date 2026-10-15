import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { AppProviders } from './app/providers/AppProviders';
import { AppRouter } from './app/router/AppRouter';
import './styles/index.css';

const Router = '__TAURI_INTERNALS__' in window ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </Router>
  </StrictMode>,
);
