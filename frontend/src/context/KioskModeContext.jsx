import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const KioskModeContext = createContext(null);

async function requestBrowserFullscreen(el) {
  if (!el) return;
  const req =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.msRequestFullscreen;
  if (req) {
    try {
      await req.call(el);
    } catch {
      /* user gesture / browser policy — layout kiosk still works */
    }
  }
}

async function exitBrowserFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) return;
  const exit =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.msExitFullscreen;
  if (exit) {
    try {
      await exit.call(document);
    } catch {
      /* ignore */
    }
  }
}

export function KioskModeProvider({ children }) {
  const [isKiosk, setIsKiosk] = useState(false);

  const enterKiosk = useCallback(async () => {
    setIsKiosk(true);
    document.documentElement.setAttribute('data-kiosk', 'true');
    await requestBrowserFullscreen(document.documentElement);
  }, []);

  const exitKiosk = useCallback(async () => {
    setIsKiosk(false);
    document.documentElement.removeAttribute('data-kiosk');
    await exitBrowserFullscreen();
  }, []);

  const toggleKiosk = useCallback(() => {
    if (isKiosk) exitKiosk();
    else enterKiosk();
  }, [isKiosk, enterKiosk, exitKiosk]);

  // ✅ Sync when user presses Esc (browser exits fullscreen)
  useEffect(() => {
    const onFsChange = () => {
      const fs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      if (!fs && isKiosk) {
        setIsKiosk(false);
        document.documentElement.removeAttribute('data-kiosk');
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, [isKiosk]);

  // ✅ Escape also exits layout kiosk if fullscreen already closed
  useEffect(() => {
    if (!isKiosk) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') exitKiosk();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isKiosk, exitKiosk]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.documentElement.removeAttribute('data-kiosk');
      exitBrowserFullscreen();
    };
  }, []);

  const value = useMemo(
    () => ({ isKiosk, enterKiosk, exitKiosk, toggleKiosk }),
    [isKiosk, enterKiosk, exitKiosk, toggleKiosk]
  );

  return (
    <KioskModeContext.Provider value={value}>{children}</KioskModeContext.Provider>
  );
}

export function useKioskMode() {
  const ctx = useContext(KioskModeContext);
  if (!ctx) {
    throw new Error('useKioskMode must be used within KioskModeProvider');
  }
  return ctx;
}
