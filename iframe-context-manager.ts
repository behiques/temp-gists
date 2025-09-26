/**
 * Iframe Context Management System
 * Handles state synchronization and navigation context between host and iframe
 */

export interface NavigationContext {
  currentRoute: string;
  previousRoute?: string;
  params?: Record<string, any>;
  query?: Record<string, any>;
  state?: Record<string, any>;
  breadcrumbs?: Array<{
    label: string;
    path: string;
    params?: Record<string, any>;
  }>;
}

export interface AppContext {
  user?: {
    id: string;
    name: string;
    email: string;
    permissions: string[];
  };
  session?: {
    id: string;
    expires: number;
    token?: string;
  };
  preferences?: Record<string, any>;
  features?: string[];
  environment: 'development' | 'staging' | 'production';
}

export interface IframeContext {
  id: string;
  route: string;
  title?: string;
  navigation: NavigationContext;
  app: AppContext;
  metadata?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export class ContextManager {
  private context: IframeContext;
  private messenger: IframeMessenger;
  private contextHistory: IframeContext[] = [];
  private maxHistorySize = 10;

  constructor(messenger: IframeMessenger, initialContext?: Partial<IframeContext>) {
    this.messenger = messenger;
    this.context = {
      id: this.generateContextId(),
      route: '/',
      navigation: {
        currentRoute: '/',
      },
      app: {
        environment: 'development'
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...initialContext
    };

    this.setupMessageHandlers();
  }

  private setupMessageHandlers() {
    // Handle context sync requests
    this.messenger.onAction(MessageTypes.STATE, StateActions.REQUEST, () => {
      return this.context;
    });

    // Handle context updates from host/iframe
    this.messenger.onAction(MessageTypes.STATE, StateActions.UPDATE, (payload) => {
      this.updateContext(payload.data);
    });

    // Handle context sync
    this.messenger.onAction(MessageTypes.STATE, StateActions.SYNC, (payload) => {
      this.syncContext(payload.data);
    });
  }

  /**
   * Get current context
   */
  getContext(): IframeContext {
    return { ...this.context };
  }

  /**
   * Update context locally and notify other side
   */
  async updateContext(updates: Partial<IframeContext>, notify = true): Promise<void> {
    // Save current context to history
    this.addToHistory();

    // Update context
    this.context = {
      ...this.context,
      ...updates,
      updatedAt: Date.now()
    };

    if (notify) {
      await this.messenger.send(
        MessageTypes.STATE, 
        StateActions.UPDATE, 
        updates
      );
    }
  }

  /**
   * Sync context with the other side
   */
  async syncContext(remoteContext?: Partial<IframeContext>): Promise<void> {
    if (remoteContext) {
      this.context = {
        ...this.context,
        ...remoteContext,
        updatedAt: Date.now()
      };
    } else {
      // Request context from the other side
      try {
        const remoteContext = await this.messenger.send<IframeContext>(
          MessageTypes.STATE,
          StateActions.REQUEST,
          undefined,
          true
        );
        
        if (remoteContext) {
          this.context = {
            ...this.context,
            ...remoteContext,
            updatedAt: Date.now()
          };
        }
      } catch (error) {
        console.warn('Failed to sync context:', error);
      }
    }
  }

  /**
   * Update navigation context
   */
  async updateNavigation(navigation: Partial<NavigationContext>): Promise<void> {
    const updatedNavigation = {
      ...this.context.navigation,
      ...navigation
    };

    await this.updateContext({
      navigation: updatedNavigation
    });
  }

  /**
   * Navigate and update context
   */
  async navigate(route: string, params?: Record<string, any>, state?: Record<string, any>): Promise<void> {
    const previousRoute = this.context.navigation.currentRoute;
    
    await this.updateNavigation({
      previousRoute,
      currentRoute: route,
      params,
      state
    });

    // Notify host about navigation
    await this.messenger.send(
      MessageTypes.NAVIGATION,
      NavigationActions.NAVIGATE_TO,
      {
        route,
        params,
        state,
        previousRoute
      }
    );
  }

  /**
   * Go back to previous route
   */
  async goBack(): Promise<void> {
    const previousRoute = this.context.navigation.previousRoute || '/';
    
    await this.navigate(previousRoute);
    
    await this.messenger.send(
      MessageTypes.NAVIGATION,
      NavigationActions.GO_BACK,
      {
        route: previousRoute
      }
    );
  }

  /**
   * Add breadcrumb to navigation
   */
  async addBreadcrumb(label: string, path: string, params?: Record<string, any>): Promise<void> {
    const breadcrumbs = this.context.navigation.breadcrumbs || [];
    
    // Avoid duplicate breadcrumbs
    const existingIndex = breadcrumbs.findIndex(b => b.path === path);
    if (existingIndex >= 0) {
      breadcrumbs.splice(existingIndex + 1); // Remove everything after existing breadcrumb
    } else {
      breadcrumbs.push({ label, path, params });
    }

    await this.updateNavigation({ breadcrumbs });
  }

  /**
   * Get navigation history
   */
  getHistory(): IframeContext[] {
    return [...this.contextHistory];
  }

  /**
   * Restore context from history
   */
  async restoreFromHistory(index: number): Promise<boolean> {
    if (index >= 0 && index < this.contextHistory.length) {
      const historicContext = this.contextHistory[index];
      await this.updateContext(historicContext);
      return true;
    }
    return false;
  }

  private addToHistory() {
    this.contextHistory.push({ ...this.context });
    
    // Limit history size
    if (this.contextHistory.length > this.maxHistorySize) {
      this.contextHistory.shift();
    }
  }

  private generateContextId(): string {
    return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Navigation Helper
export class NavigationHelper {
  private contextManager: ContextManager;
  private messenger: IframeMessenger;

  constructor(contextManager: ContextManager, messenger: IframeMessenger) {
    this.contextManager = contextManager;
    this.messenger = messenger;
  }

  /**
   * Navigate to external page (host handles this)
   */
  async navigateExternal(url: string, target = '_self'): Promise<void> {
    await this.messenger.send(
      MessageTypes.NAVIGATION,
      NavigationActions.NAVIGATE_TO,
      {
        url,
        target,
        external: true
      }
    );
  }

  /**
   * Navigate with context preservation
   */
  async navigateWithContext(route: string, preserveContext = true): Promise<void> {
    if (preserveContext) {
      const currentContext = this.contextManager.getContext();
      await this.contextManager.navigate(route, {}, { preservedContext: currentContext });
    } else {
      await this.contextManager.navigate(route);
    }
  }

  /**
   * Open modal/popup and wait for result
   */
  async openModal<T = any>(route: string, data?: any): Promise<T> {
    return await this.messenger.send<T>(
      MessageTypes.UI,
      UIActions.MODAL_OPEN,
      {
        route,
        data
      },
      true
    );
  }

  /**
   * Close current modal/popup with result
   */
  async closeModal(result?: any): Promise<void> {
    await this.messenger.send(
      MessageTypes.UI,
      UIActions.MODAL_CLOSE,
      result
    );
  }
}
