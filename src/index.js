import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import './index.css';

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  enabled: !!process.env.REACT_APP_SENTRY_DSN,
  beforeSend(event) {
    // Don't send events for localhost
    if (window.location.hostname === 'localhost') return null;
    return event;
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
