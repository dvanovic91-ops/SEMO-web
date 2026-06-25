import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { installImageSaveGuard } from './lib/installImageSaveGuard';
import { applyNavLogoTuneStyles } from './lib/navLogoTune';

applyNavLogoTuneStyles();
installImageSaveGuard();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
