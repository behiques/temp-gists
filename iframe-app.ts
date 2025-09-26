/**
 * Iframe Application Integration
 * Utilities for iframe applications to communicate with the host
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { IframeMessenger, MessageTypes, NavigationActions, StateActions, UIActions } from './iframe-messaging-lib';
import { ContextManager, IframeContext, NavigationHelper } from './iframe-context-manager';

export interface IframeAppConfig {
  hostOrigin: string;
  debug?: boolean;
  autoSync?: boolean;
  syncInterval?: number;
}

export class IframeApp {
  private messenger: IframeMessenger;
  private contextManager: ContextManager;
  private navigationHelper: NavigationHelper;
  private config: Required<IframeAppConfig>;
  private isInitialized = false;

  constructor(config: IframeAppConfig) {
    this.config = {
      debug: false,
      autoSync: true,
      syncInterval: 5000,
      ...config
    };

    // Initialize messenger
    this.messenger = new IframeMessenger({
      targetOrigin: this.config.hostOrigin,
      debug: this.config.debug
    }, false);

    // Initialize context manager
    this.contextManager = new ContextManager(this.messenger);

    // Initialize navigation helper
    this.navigationHelper = new NavigationHelper(this.contextManager, this.messenger);

    this.setupDefaultHandlers();
  }

  /**
   * Initialize the iframe app
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Sync with host context
    await this.contextManager.syncContext();

    // Setup auto-sync if enabled
    if (this.config.autoSync) {
      setInterval(() => {
        this.contextManager.syncContext().catch(err => {
          if (this.config.debug) {
            console.warn('Auto-sync failed:', err);
          }
        });
      }, this.config.syncInterval);
    }

    this.isInitialized = true;

    // Notify host that iframe is ready
    await this.messenger.send(MessageTypes.LIFECYCLE, 'ready', {
      timestamp: Date.now(),
      route: window.location.pathname
    });
  }

  /**
   * Get messenger instance
   */
  getMessenger(): IframeMessenger {
    return this.messenger;
  }

  /**
   * Get context manager instance
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * Get navigation helper instance
   */
  getNavigationHelper(): NavigationHelper {
    return this.navigationHelper;
  }

  /**
   * Send status message to host
   */
  async sendStatus(status: 'success' | 'error' | 'warning' | 'info', message: string, data?: any): Promise<void> {
    await this.messenger.send(MessageTypes.DATA, 'status', {
      status,
      message,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Request data from host
   */
  async requestData<T = any>(type: string, params?: any): Promise<T> {
    return await this.messenger.send<T>(MessageTypes.DATA, 'request', {
      type,
      params
    }, true);
  }

  /**
   * Send data to host
   */
  async sendData(type: string, data: any): Promise<void> {
    await this.messenger.send(MessageTypes.DATA, 'send', {
      type,
      data
    });
  }

  /**
   * Navigate to route within iframe
   */
  async navigate(route: string, params?: Record<string, any>, state?: Record<string, any>): Promise<void> {
    await this.contextManager.navigate(route, params, state);
  }

  /**
   * Navigate to external URL (host handles this)
   */
  async navigateExternal(url: string, target = '_self'): Promise<void> {
    await this.navigationHelper.navigateExternal(url, target);
  }

  /**
   * Go back to previous route
   */
  async goBack(): Promise<void> {
    await this.contextManager.goBack();
  }

  /**
   * Open modal and wait for result
   */
  async openModal<T = any>(route: string, data?: any): Promise<T> {
    return await this.navigationHelper.openModal<T>(route, data);
  }

  /**
   * Close current modal with result
   */
  async closeModal(result?: any): Promise<void> {
    await this.navigationHelper.closeModal(result);
  }

  /**
   * Update iframe size
   */
  async requestResize(width: number | string, height: number | string): Promise<void> {
    await this.messenger.send(MessageTypes.UI, UIActions.RESIZE, {
      width,
      height
    });
  }

  /**
   * Show/hide loading state
   */
  async setLoading(isLoading: boolean, message?: string): Promise<void> {
    await this.messenger.send(MessageTypes.UI, 'loading', {
      isLoading,
      message
    });
  }

  /**
   * Show notification in host
   */
  async showNotification(type: 'success' | 'error' | 'warning' | 'info', message: string, timeout?: number): Promise<void> {
    await this.messenger.send(MessageTypes.UI, 'notification', {
      type,
      message,
      timeout
    });
  }

  /**
   * Register custom message handler
   */
  onMessage(type: string, action: string, handler: (data: any) => any): void {
    this.messenger.onAction(type, action, (payload) => handler(payload.data));
  }

  /**
   * Remove message handler
   */
  offMessage(type: string, action?: string): void {
    this.messenger.off(type, action);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.messenger.destroy();
  }

  private setupDefaultHandlers(): void {
    // Handle focus/blur from host
    this.messenger.onAction(MessageTypes.UI, UIActions.FOCUS, () => {
      if (document.activeElement !== document.body) {
        (document.activeElement as HTMLElement)?.focus();
      }
    });

    this.messenger.onAction(MessageTypes.UI, UIActions.BLUR, () => {
      (document.activeElement as HTMLElement)?.blur();
    });

    // Handle resize from host
    this.messenger.onAction(MessageTypes.UI, UIActions.RESIZE, (payload) => {
      // Dispatch custom event for components to handle
      window.dispatchEvent(new CustomEvent('iframe-resize', {
        detail: payload.data
      }));
    });
  }
}

// React Hook for Iframe Integration
export function useIframeApp(config: IframeAppConfig) {
  const [app] = useState(() => new IframeApp(config));
  const [isInitialized, setIsInitialized] = useState(false);
  const [context, setContext] = useState<IframeContext | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    app.initialize().then(() => {
      setIsInitialized(true);
      setContext(app.getContextManager().getContext());
    });

    return () => {
      app.destroy();
    };
  }, [app]);

  // Update context when it changes
  useEffect(() => {
    if (!isInitialized) return;

    const interval = setInterval(() => {
      const newContext = app.getContextManager().getContext();
      setContext(prevContext => {
        if (prevContext?.updatedAt !== newContext.updatedAt) {
          return newContext;
        }
        return prevContext;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [app, isInitialized]);

  const sendStatus = useCallback((status: 'success' | 'error' | 'warning' | 'info', message: string, data?: any) => {
    return app.sendStatus(status, message, data);
  }, [app]);

  const requestData = useCallback(<T = any>(type: string, params?: any) => {
    return app.requestData<T>(type, params);
  }, [app]);

  const sendData = useCallback((type: string, data: any) => {
    return app.sendData(type, data);
  }, [app]);

  const navigate = useCallback((route: string, params?: Record<string, any>, state?: Record<string, any>) => {
    return app.navigate(route, params, state);
  }, [app]);

  const navigateExternal = useCallback((url: string, target = '_self') => {
    return app.navigateExternal(url, target);
  }, [app]);

  const goBack = useCallback(() => {
    return app.goBack();
  }, [app]);

  const openModal = useCallback(<T = any>(route: string, data?: any) => {
    return app.openModal<T>(route, data);
  }, [app]);

  const closeModal = useCallback((result?: any) => {
    return app.closeModal(result);
  }, [app]);

  const requestResize = useCallback((width: number | string, height: number | string) => {
    return app.requestResize(width, height);
  }, [app]);

  const setLoading = useCallback((isLoading: boolean, message?: string) => {
    return app.setLoading(isLoading, message);
  }, [app]);

  const showNotification = useCallback((type: 'success' | 'error' | 'warning' | 'info', message: string, timeout?: number) => {
    return app.showNotification(type, message, timeout);
  }, [app]);

  const onMessage = useCallback((type: string, action: string, handler: (data: any) => any) => {
    app.onMessage(type, action, handler);
  }, [app]);

  const offMessage = useCallback((type: string, action?: string) => {
    app.offMessage(type, action);
  }, [app]);

  return {
    isInitialized,
    context,
    app,
    sendStatus,
    requestData,
    sendData,
    navigate,
    navigateExternal,
    goBack,
    openModal,
    closeModal,
    requestResize,
    setLoading,
    showNotification,
    onMessage,
    offMessage
  };
}

// Utility hook for handling iframe resize
export function useIframeResize() {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const handleResize = (event: CustomEvent) => {
      setDimensions(event.detail);
    };

    window.addEventListener('iframe-resize', handleResize as EventListener);
    
    return () => {
      window.removeEventListener('iframe-resize', handleResize as EventListener);
    };
  }, []);

  return dimensions;
}
