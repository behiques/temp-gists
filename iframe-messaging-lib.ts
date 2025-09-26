/**
 * Iframe-Host Messaging Library
 * Provides bidirectional communication between iframe and host applications
 */

export interface MessagePayload {
  id: string;
  type: string;
  action: string;
  data?: any;
  timestamp: number;
  requiresResponse?: boolean;
  responseId?: string;
  source: 'host' | 'iframe';
  targetOrigin?: string;
}

export interface PendingMessage {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeout: NodeJS.Timeout;
}

export interface MessagingConfig {
  targetOrigin: string;
  timeout?: number;
  debug?: boolean;
  maxRetries?: number;
}

export class IframeMessenger {
  private pendingMessages = new Map<string, PendingMessage>();
  private messageHandlers = new Map<string, (payload: MessagePayload) => any>();
  private config: Required<MessagingConfig>;
  private isHost: boolean;
  private targetWindow: Window | null = null;

  constructor(config: MessagingConfig, isHost = false) {
    this.config = {
      timeout: 5000,
      debug: false,
      maxRetries: 3,
      ...config
    };
    this.isHost = isHost;
    this.init();
  }

  private init() {
    window.addEventListener('message', this.handleMessage.bind(this));
    
    if (!this.isHost) {
      // For iframe, target window is parent
      this.targetWindow = window.parent;
    }
  }

  /**
   * Set target window for host applications
   */
  setTargetWindow(iframe: HTMLIFrameElement) {
    if (this.isHost && iframe.contentWindow) {
      this.targetWindow = iframe.contentWindow;
    }
  }

  /**
   * Send a message and optionally wait for response
   */
  async send<T = any>(
    type: string, 
    action: string, 
    data?: any, 
    requiresResponse = false
  ): Promise<T | void> {
    const messageId = this.generateId();
    const payload: MessagePayload = {
      id: messageId,
      type,
      action,
      data,
      timestamp: Date.now(),
      requiresResponse,
      source: this.isHost ? 'host' : 'iframe',
      targetOrigin: this.config.targetOrigin
    };

    this.log('Sending message:', payload);

    if (requiresResponse) {
      return this.sendWithResponse<T>(payload);
    } else {
      this.postMessage(payload);
    }
  }

  /**
   * Send a response to a received message
   */
  respond(originalMessageId: string, data?: any) {
    const responsePayload: MessagePayload = {
      id: this.generateId(),
      type: 'response',
      action: 'message_response',
      data,
      timestamp: Date.now(),
      responseId: originalMessageId,
      source: this.isHost ? 'host' : 'iframe',
      targetOrigin: this.config.targetOrigin
    };

    this.log('Sending response:', responsePayload);
    this.postMessage(responsePayload);
  }

  /**
   * Register a message handler
   */
  on(type: string, handler: (payload: MessagePayload) => any) {
    this.messageHandlers.set(`${type}`, handler);
  }

  /**
   * Register a message handler for specific action
   */
  onAction(type: string, action: string, handler: (payload: MessagePayload) => any) {
    this.messageHandlers.set(`${type}:${action}`, handler);
  }

  /**
   * Remove message handler
   */
  off(type: string, action?: string) {
    const key = action ? `${type}:${action}` : type;
    this.messageHandlers.delete(key);
  }

  private async sendWithResponse<T>(payload: MessagePayload): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(payload.id);
        reject(new Error(`Message timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      this.pendingMessages.set(payload.id, {
        resolve,
        reject,
        timeout
      });

      this.postMessage(payload);
    });
  }

  private handleMessage(event: MessageEvent) {
    // Verify origin for security
    if (event.origin !== this.config.targetOrigin) {
      this.log('Message from unauthorized origin:', event.origin);
      return;
    }

    const payload = event.data as MessagePayload;
    
    if (!this.isValidPayload(payload)) {
      this.log('Invalid message payload:', payload);
      return;
    }

    this.log('Received message:', payload);

    // Handle response messages
    if (payload.type === 'response' && payload.responseId) {
      this.handleResponse(payload);
      return;
    }

    // Handle regular messages
    this.handleIncomingMessage(payload);
  }

  private handleResponse(payload: MessagePayload) {
    const pendingMessage = this.pendingMessages.get(payload.responseId!);
    if (pendingMessage) {
      clearTimeout(pendingMessage.timeout);
      this.pendingMessages.delete(payload.responseId!);
      pendingMessage.resolve(payload.data);
    }
  }

  private async handleIncomingMessage(payload: MessagePayload) {
    // Try specific action handler first
    const actionHandler = this.messageHandlers.get(`${payload.type}:${payload.action}`);
    if (actionHandler) {
      const result = await actionHandler(payload);
      if (payload.requiresResponse) {
        this.respond(payload.id, result);
      }
      return;
    }

    // Try general type handler
    const typeHandler = this.messageHandlers.get(payload.type);
    if (typeHandler) {
      const result = await typeHandler(payload);
      if (payload.requiresResponse) {
        this.respond(payload.id, result);
      }
      return;
    }

    this.log('No handler found for message:', payload);
    
    if (payload.requiresResponse) {
      this.respond(payload.id, { error: 'No handler found' });
    }
  }

  private postMessage(payload: MessagePayload) {
    if (!this.targetWindow) {
      throw new Error('Target window not available');
    }

    this.targetWindow.postMessage(payload, this.config.targetOrigin);
  }

  private isValidPayload(payload: any): payload is MessagePayload {
    return payload && 
           typeof payload.id === 'string' &&
           typeof payload.type === 'string' &&
           typeof payload.action === 'string' &&
           typeof payload.timestamp === 'number' &&
           (payload.source === 'host' || payload.source === 'iframe');
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private log(...args: any[]) {
    if (this.config.debug) {
      console.log('[IframeMessenger]', ...args);
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    window.removeEventListener('message', this.handleMessage);
    
    // Clear all pending messages
    this.pendingMessages.forEach(pending => {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Messenger destroyed'));
    });
    
    this.pendingMessages.clear();
    this.messageHandlers.clear();
  }
}

// Convenience functions for common message types
export const MessageTypes = {
  NAVIGATION: 'navigation',
  STATE: 'state',
  AUTH: 'auth',
  DATA: 'data',
  UI: 'ui',
  ERROR: 'error',
  LIFECYCLE: 'lifecycle'
} as const;

export const NavigationActions = {
  NAVIGATE_TO: 'navigate_to',
  GO_BACK: 'go_back',
  RELOAD: 'reload',
  CLOSE: 'close'
} as const;

export const StateActions = {
  SYNC: 'sync',
  UPDATE: 'update',
  REQUEST: 'request',
  RESET: 'reset'
} as const;

export const UIActions = {
  RESIZE: 'resize',
  FOCUS: 'focus',
  BLUR: 'blur',
  MODAL_OPEN: 'modal_open',
  MODAL_CLOSE: 'modal_close'
} as const;
