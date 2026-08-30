import * as React from 'react';

// Mirrored as a plain SVG string in src/lib/email/logo.ts for the emailed
// logo (Next.js's App Router graph forbids rendering this via
// react-dom/server from a Route Handler) — update that string too if this
// markup changes.
export const SmartKeyMark = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 48 48"
    aria-hidden="true"
    className={className}
  >
    <g
      transform="translate(24 24) scale(0.8) translate(-24 -24)"
      strokeLinecap="round"
    >
      <circle
        cx="19.5"
        cy="10.5"
        r="7"
        fill="none"
        stroke="#D4A437"
        strokeWidth="4.5"
      />
      <rect x="16" y="12" width="7" height="29" rx="3.5" fill="#F4EEE3" />
      <line x1="20" y1="27" x2="35" y2="15" stroke="#F4EEE3" strokeWidth="7" />
      <line x1="20" y1="27" x2="35" y2="41" stroke="#F4EEE3" strokeWidth="7" />
      <rect x="10" y="31" width="6.5" height="3.6" rx="1.2" fill="#F4EEE3" />
      <rect x="10" y="37" width="6.5" height="3.6" rx="1.2" fill="#F4EEE3" />
    </g>
  </svg>
);
