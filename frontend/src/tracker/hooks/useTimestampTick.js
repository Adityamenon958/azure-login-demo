import { useEffect, useState } from 'react';
import { TIMESTAMP_TICK_MS } from '../constants/pollIntervals';

/**
 * Shared client-side clock for relative timestamps.
 * One interval for the whole Fleet Map tree — not per card.
 */
export function useTimestampTick(intervalMs = TIMESTAMP_TICK_MS) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
