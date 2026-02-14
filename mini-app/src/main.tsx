import React from 'react';
import ReactDOM from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { ThemeProvider, ToastProvider } from '@telegram-tools/ui-kit';
import '@telegram-tools/ui-kit/dist/index.css';
import { App } from './App';
import './styles.css';

const manifestUrl = 'https://market.meerkscan.com/tonconnect-manifest.json';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <TonConnectUIProvider manifestUrl={manifestUrl}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </TonConnectUIProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
