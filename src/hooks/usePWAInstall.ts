import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Armazenamento global leve para não perder o evento beforeinstallprompt
// caso dispare antes de algum botão de instalação montar na árvore React.
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
let globalInstalled = false;
const listeners = new Set<() => void>();
let globalListenersBound = false;

function notifyAll() {
  listeners.forEach((fn) => fn());
}

function checkStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function bindGlobalPWAListeners() {
  if (globalListenersBound || typeof window === 'undefined') return;
  globalListenersBound = true;
  globalInstalled = checkStandalone();

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    notifyAll();
  });

  window.addEventListener('appinstalled', () => {
    globalInstalled = true;
    globalDeferredPrompt = null;
    notifyAll();
  });
}

bindGlobalPWAListeners();

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => globalDeferredPrompt,
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => globalInstalled || checkStandalone());
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    bindGlobalPWAListeners();

    const ua = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(ua);
    const mobileDevice = iosDevice || /android|mobile/.test(ua);
    setIsIOS(iosDevice);
    setIsMobile(mobileDevice);
    setIsInstalled(globalInstalled || checkStandalone());
    setDeferredPrompt(globalDeferredPrompt);

    const sync = () => {
      setDeferredPrompt(globalDeferredPrompt);
      setIsInstalled(globalInstalled || checkStandalone());
    };
    listeners.add(sync);

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const onDisplayModeChange = () => {
      globalInstalled = checkStandalone();
      sync();
    };
    mediaQuery.addEventListener?.('change', onDisplayModeChange);

    return () => {
      listeners.delete(sync);
      mediaQuery.removeEventListener?.('change', onDisplayModeChange);
    };
  }, []);

  const install = async () => {
    const promptEvent = globalDeferredPrompt || deferredPrompt;
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      globalInstalled = true;
      globalDeferredPrompt = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
      notifyAll();
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isMobile,
    install,
  };
}
