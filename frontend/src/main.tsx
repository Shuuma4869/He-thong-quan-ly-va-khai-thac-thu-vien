import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, createHashRouter, RouterProvider } from 'react-router-dom';
import { Application } from './app/router/Application';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource-variable/literata/wght.css';
import './styles/index.css';
import './styles/library-theme.css';
import './styles/premium.css';
import './styles/appearance.css';

const createRouter = '__TAURI_INTERNALS__' in window ? createHashRouter : createBrowserRouter;
const router = createRouter([{ path: '*', element: <Application/> }]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router}/>
  </StrictMode>,
);
