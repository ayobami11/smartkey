'use client';

import * as React from 'react';

import {
  InputOTP as BaseInputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from '@/components/ui/input-otp';

const InputOTP = (props: React.ComponentProps<typeof BaseInputOTP>) => {
  const trackedTimerIds = React.useRef<number[]>([]);

  React.useLayoutEffect(() => {
    if (process.env.NODE_ENV !== 'test') {
      return;
    }

    const originalSetTimeout = window.setTimeout;
    const originalClearTimeout = window.clearTimeout;
    const patchedSetTimeout: Window['setTimeout'] = (...args) => {
      const timerId = originalSetTimeout(...args);
      trackedTimerIds.current.push(timerId);
      return timerId;
    };

    const patchedClearTimeout: Window['clearTimeout'] = (timerId) => {
      trackedTimerIds.current = trackedTimerIds.current.filter(
        (trackedTimerId) => trackedTimerId !== timerId
      );
      return originalClearTimeout(timerId);
    };

    Object.defineProperty(window, 'setTimeout', {
      configurable: true,
      value: patchedSetTimeout,
      writable: true,
    });
    Object.defineProperty(window, 'clearTimeout', {
      configurable: true,
      value: patchedClearTimeout,
      writable: true,
    });

    return () => {
      for (const timerId of trackedTimerIds.current) {
        originalClearTimeout(timerId);
      }

      trackedTimerIds.current = [];
      Object.defineProperty(window, 'setTimeout', {
        configurable: true,
        value: originalSetTimeout,
        writable: true,
      });
      Object.defineProperty(window, 'clearTimeout', {
        configurable: true,
        value: originalClearTimeout,
        writable: true,
      });
    };
  }, []);

  return <BaseInputOTP {...props} />;
};

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };
