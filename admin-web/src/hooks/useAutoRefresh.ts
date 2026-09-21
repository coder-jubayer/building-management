import { useEffect, useRef } from 'react';

export function useAutoRefresh(callback: () => void, intervalMs = 8000) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    const id = window.setInterval(() => saved.current(), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}
