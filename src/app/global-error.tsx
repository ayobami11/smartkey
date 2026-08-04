'use client';

import { useEffect } from 'react';

import { logger } from '@/lib/logger';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

// Catches errors thrown by the root layout itself, so it must render its own
// <html>/<body> and cannot depend on ThemeProvider, the font variables, or any
// other context the root layout normally provides — those may be exactly what
// failed. Styled with inline styles rather than design tokens for that reason.
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    logger.error('Unhandled root layout error', {
      err: error.message,
      digest: error.digest,
    });
  }, [error]);

  const reference = error.digest ?? 'unavailable';

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3rem 1rem',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
          backgroundColor: '#ffffff',
          color: '#1a1a1a',
        }}
      >
        <div role="alert" style={{ maxWidth: '24rem', textAlign: 'center' }}>
          <p
            style={{
              color: '#7B1F2D',
              fontWeight: 600,
              fontSize: '1.125rem',
              marginBottom: '2rem',
            }}
          >
            SmartKey
          </p>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p
            style={{
              marginTop: '0.75rem',
              fontSize: '0.875rem',
              lineHeight: 1.6,
              color: '#555',
            }}
          >
            Nothing was lost — the application failed to load. Try again, or get
            help if it keeps happening.
          </p>
          <p
            style={{
              marginTop: '1rem',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              color: '#555',
            }}
          >
            Error reference: {reference} — share this with the CSO if you
            contact support.
          </p>
          <div
            style={{
              marginTop: '2rem',
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'center',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                backgroundColor: '#7B1F2D',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/help"
              style={{
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#1a1a1a',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Get help
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
