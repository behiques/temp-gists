/**
 * Host Application Integration
 * Utilities for managing iframes and handling iframe messages in the host app
 */

import { IframeMessenger, MessageTypes, NavigationActions, StateActions, UIActions } from './iframe-messaging-lib';
import { ContextManager, IframeContext, NavigationHelper } from './iframe-context-manager';

export interface IframeConfig {
  id: string;
  src: string;
  title?: string;
  width?: string | number;
  height?: string | number;
  allowFullscreen?: boolean;
  sandbox?: string;
  className?: string;
  style?: React.CSSProperties;
}

export interface ManagedIframe {
  id: string;
  element: HTMLIFrameElement;
  messenger: IframeMessenger;
  contextManager: ContextManager;
  navigationHelper: NavigationHelper;
  config: IframeConfig;
  isLoaded: boolean;
}

export class HostIframeManager {
  private iframes = new Map<string, ManagedIframe>();
  private modalStack: string[] = [];
  private onNavigationCallback?: (iframe: ManagedIframe, route: string, data?: any) => void;
  private onModalCallback?: (iframe: ManagedIframe, action: 'open' | 'close', data?: any) => void;

  /**
   * Create and register a new iframe
   */
  async createIframe(config: IframeConfig, container: HTMLElement): Promise<ManagedIframe> {
    // Create iframe element
    const iframe = document.createElement('iframe');
    iframe.id = config.id;
    iframe.src = config.src;
    iframe.title = config.title || config.id;
    iframe.style.border = 'none';
    iframe.style.width = typeof config.width === 'number' ? `${config.width}px` : config.width || '100%';
    iframe.style.height = typeof config.height === 'number' ? `${config.height}px` : config.height || '400px';
    
    if (config.allowFullscreen) {
      iframe.allowFullscreen = true;
    }
    
    if (config.sandbox) {
      iframe.sandbox.add(...config.sandbox.split(' '));
    }
    
    if (config.className) {
      iframe.className = config.className;
    }
    
    if (config.style) {
      Object.assign(iframe.style, config.style);
    }

    // Create messenger
    const messenger = new IframeMessenger({
      targetOrigin: new URL(config.src).origin,
      debug: process.env.NODE_ENV === 'development'
    }, true);

    // Create context manager
    const contextManager = new ContextManager(messenger, {
      id: config.id,
      route: new URL(config.src).pathname
    });

    // Create navigation helper
    const navigationHelper = new NavigationHelper(contextManager, messenger);

    const managedIframe: ManagedIframe = {
      id: config.id,
      element: iframe,
      messenger,
      contextManager,
      navigationHelper,
      config,
      isLoaded: false
    };

    // Setup message handlers
    this.setupIframeHandlers(managedIframe);

    // Add to container
    container.appendChild(iframe);

    // Wait for iframe to load
    await new Promise<void>((resolve) => {
      iframe.onload = () => {
        managedIframe.isLoaded = true;
        messenger.setTargetWindow(iframe);
        resolve();
      };
    });

    // Register iframe
    this.iframes.set(config.id, managedIframe);

    // Initial context sync
    await contextManager.syncContext();

    return managedIframe;
  }

  /**
   * Get managed iframe by ID
   */
  getIframe(id: string): ManagedIframe | undefined {
    return this.iframes.get(id);
  }

  /**
   * Get all managed iframes
   */
  getAllIframes(): ManagedIframe[] {
    return Array.from(this.iframes.values());
  }

  /**
   * Remove iframe
   */
  removeIframe(id: string): void {
    const iframe = this.iframes.get(id);
    if (iframe) {
      iframe.messenger.destroy();
      iframe.element.remove();
      this.iframes.delete(id);
    }
  }

  /**
   * Send message to specific iframe
   */
  async sendToIframe<T = any>(
    iframeId: string, 
    type: string, 
    action: string, 
    data?: any, 
    requiresResponse = false
  ): Promise<T | void> {
    const iframe = this.iframes.get(iframeId);
    if (iframe) {
      return await iframe.messenger.send<T>(type, action, data, requiresResponse);
    }
    throw new Error(`Iframe ${iframeId} not found`);
  }

  /**
   * Broadcast message to all iframes
   */
  async broadcastToIframes(type: string, action: string, data?: any): Promise<void> {
    const promises = Array.from(this.iframes.values()).map(iframe =>
      iframe.messenger.send(type, action, data).catch(err => 
        console.warn(`Failed to send message to iframe ${iframe.id}:`, err)
      )
    );
    
    await Promise.allSettled(promises);
  }

  /**
   * Set navigation callback
   */
  onNavigation(callback: (iframe: ManagedIframe, route: string, data?: any) => void): void {
    this.onNavigationCallback = callback;
  }

  /**
   * Set modal callback
   */
  onModal(callback: (iframe: ManagedIframe, action: 'open' | 'close', data?: any) => void): void {
    this.onModalCallback = callback;
  }

  /**
   * Resize iframe
   */
  resizeIframe(id: string, width: string | number, height: string | number): void {
    const iframe = this.iframes.get(id);
    if (iframe) {
      iframe.element.style.width = typeof width === 'number' ? `${width}px` : width;
      iframe.element.style.height = typeof height === 'number' ? `${height}px` : height;
      
      // Notify iframe of resize
      iframe.messenger.send(MessageTypes.UI, UIActions.RESIZE, { width, height });
    }
  }

  /**
   * Focus iframe
   */
  focusIframe(id: string): void {
    const iframe = this.iframes.get(id);
    if (iframe) {
      iframe.element.focus();
      iframe.messenger.send(MessageTypes.UI, UIActions.FOCUS);
    }
  }

  private setupIframeHandlers(iframe: ManagedIframe): void {
    // Handle navigation requests
    iframe.messenger.onAction(MessageTypes.NAVIGATION, NavigationActions.NAVIGATE_TO, (payload) => {
      this.handleNavigation(iframe, payload.data);
    });

    iframe.messenger.onAction(MessageTypes.NAVIGATION, NavigationActions.GO_BACK, (payload) => {
      this.handleGoBack(iframe, payload.data);
    });

    // Handle modal requests
    iframe.messenger.onAction(MessageTypes.UI, UIActions.MODAL_OPEN, (payload) => {
      return this.handleModalOpen(iframe, payload.data);
    });

    iframe.messenger.onAction(MessageTypes.UI, UIActions.MODAL_CLOSE, (payload) => {
      this.handleModalClose(iframe, payload.data);
    });

    // Handle context updates
    iframe.messenger.onAction(MessageTypes.STATE, StateActions.UPDATE, (payload) => {
      iframe.contextManager.updateContext(payload.data, false);
    });

    // Handle errors
    iframe.messenger.on(MessageTypes.ERROR, (payload) => {
      console.error(`Error from iframe ${iframe.id}:`, payload.data);
    });
  }

  private handleNavigation(iframe: ManagedIframe, data: any): void {
    if (data.external) {
      // Handle external navigation
      if (data.target === '_blank') {
        window.open(data.url, '_blank');
      } else {
        window.location.href = data.url;
      }
    } else {
      // Update iframe context
      iframe.contextManager.updateNavigation({
        currentRoute: data.route,
        previousRoute: data.previousRoute,
        params: data.params,
        state: data.state
      });

      // Call navigation callback if provided
      if (this.onNavigationCallback) {
        this.onNavigationCallback(iframe, data.route, data);
      }
    }
  }

  private handleGoBack(iframe: ManagedIframe, data: any): void {
    // Handle back navigation
    if (this.onNavigationCallback) {
      this.onNavigationCallback(iframe, data.route, { ...data, isBack: true });
    }
  }

  private handleModalOpen(iframe: ManagedIframe, data: any): Promise<any> {
    return new Promise((resolve) => {
      // Add to modal stack
      this.modalStack.push(iframe.id);

      // Store resolve function for later use
      (iframe as any).modalResolve = resolve;

      // Call modal callback if provided
      if (this.onModalCallback) {
        this.onModalCallback(iframe, 'open', data);
      }
    });
  }

  private handleModalClose(iframe: ManagedIframe, data: any): void {
    // Remove from modal stack
    const index = this.modalStack.indexOf(iframe.id);
    if (index > -1) {
      this.modalStack.splice(index, 1);
    }

    // Resolve the modal promise if it exists
    if ((iframe as any).modalResolve) {
      (iframe as any).modalResolve(data);
      delete (iframe as any).modalResolve;
    }

    // Call modal callback if provided
    if (this.onModalCallback) {
      this.onModalCallback(iframe, 'close', data);
    }
  }
}

// React Hook for Host Integration
export function useHostIframeManager() {
  const [manager] = useState(() => new HostIframeManager());
  const [iframes, setIframes] = useState<ManagedIframe[]>([]);

  useEffect(() => {
    const updateIframes = () => {
      setIframes(manager.getAllIframes());
    };

    // Update iframe list periodically
    const interval = setInterval(updateIframes, 1000);
    updateIframes();

    return () => {
      clearInterval(interval);
      // Cleanup all iframes
      manager.getAllIframes().forEach(iframe => {
        manager.removeIframe(iframe.id);
      });
    };
  }, [manager]);

  return {
    manager,
    iframes,
    createIframe: manager.createIframe.bind(manager),
    getIframe: manager.getIframe.bind(manager),
    removeIframe: manager.removeIframe.bind(manager),
    sendToIframe: manager.sendToIframe.bind(manager),
    broadcastToIframes: manager.broadcastToIframes.bind(manager),
    resizeIframe: manager.resizeIframe.bind(manager),
    focusIframe: manager.focusIframe.bind(manager)
  };
}
