# Iframe-Host Messaging System

A comprehensive messaging system for bidirectional communication between iframe applications and their host applications.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Installation and Setup](#installation-and-setup)
3. [Core Components](#core-components)
4. [Message Protocol](#message-protocol)
5. [Implementation Guide](#implementation-guide)
6. [Advanced Scenarios](#advanced-scenarios)
7. [Security Considerations](#security-considerations)
8. [Troubleshooting](#troubleshooting)

## Architecture Overview

The system consists of four main components:

1. **Core Messaging Library** (`iframe-messaging-lib.ts`) - Handles all communication protocols
2. **Iframe Context Management System** (`iframe-context-manager.ts`) - Maintains state synchronization
3. **Host Integration** (`host-iframe-manager.ts`) - Utilities for host applications
4. **Iframe Integration** (`iframe-app.ts`) - Utilities for iframe applications

### Communication Flow

```
Host Application ←→ IframeMessenger ←→ PostMessage API ←→ IframeMessenger ←→ Iframe Application
                         ↓                                        ↓
                   ContextManager                           ContextManager
                         ↓                                        ↓
                 NavigationHelper                         NavigationHelper
```

## Installation and Setup

### Prerequisites

- Node.js 16+ 
- TypeScript 4.5+
- React 17+ (for React hooks)
- Next.js 12+ (for Next.js integration)

### Basic Setup

1. Copy the library files to your project:
   - `iframe-messaging-lib.ts`
   - `iframe-context-manager.ts` 
   - `host-iframe-manager.ts`
   - `iframe-app.ts`

2. Install dependencies:
```bash
npm install react react-dom typescript
```

3. Configure TypeScript (tsconfig.json):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve"
  }
}
```

## Core Components

### IframeMessenger

The core messaging class that handles all communication:

```typescript
import { IframeMessenger, MessageTypes } from './iframe-messaging-lib';

// For host applications
const messenger = new IframeMessenger({
  targetOrigin: 'http://localhost:3001',
  debug: true
}, true);

// For iframe applications  
const messenger = new IframeMessenger({
  targetOrigin: 'http://localhost:3000',
  debug: true
}, false);
```

### ContextManager

Manages application state and navigation context:

```typescript
import { ContextManager } from './iframe-context-manager';

const contextManager = new ContextManager(messenger, {
  id: 'my-app',
  route: '/dashboard'
});
```

## Message Protocol

### Message Structure

All messages follow this standardized format:

```typescript
interface MessagePayload {
  id: string;              // Unique message identifier
  type: string;            // Message category (navigation, state, data, etc.)
  action: string;          // Specific action within the type
  data?: any;              // Message payload
  timestamp: number;       // When message was sent
  requiresResponse?: boolean; // Whether sender expects a response
  responseId?: string;     // ID of message this is responding to
  source: 'host' | 'iframe'; // Who sent the message
  targetOrigin?: string;   // Expected origin for security
}
```

### Predefined Message Types

#### Navigation Messages
```typescript
// Navigate to a new route
await messenger.send(MessageTypes.NAVIGATION, NavigationActions.NAVIGATE_TO, {
  route: '/orders',
  params: { userId: '123' },
  state: { fromDashboard: true }
});

// Go back to previous route
await messenger.send(MessageTypes.NAVIGATION, NavigationActions.GO_BACK);
```

#### State Messages  
```typescript
// Update application state
await messenger.send(MessageTypes.STATE, StateActions.UPDATE, {
  user: { id: '123', name: 'John' }
});

// Request current state
const state = await messenger.send(MessageTypes.STATE, StateActions.REQUEST, undefined, true);
```

#### Data Messages
```typescript
// Send data
await messenger.send(MessageTypes.DATA, 'user-created', {
  userId: '123',
  name: 'John Doe'
});

// Request data
const users = await messenger.send(MessageTypes.DATA, 'get-users', { limit: 10 }, true);
```

#### UI Messages
```typescript
// Resize iframe
await messenger.send(MessageTypes.UI, UIActions.RESIZE, {
  width: '100%',
  height: '500px'
});

// Open modal
const result = await messenger.send(MessageTypes.UI, UIActions.MODAL_OPEN, {
  route: '/user-settings',
  data: { userId: '123' }
}, true);
```

## Implementation Guide

### Host Application Setup

1. **Basic Integration**:

```typescript
// app.tsx
import React, { useEffect } from 'react';
import { useHostIframeManager } from './host-iframe-manager';

function App() {
  const { manager, createIframe } = useHostIframeManager();

  useEffect(() => {
    // Setup message handlers
    manager.onNavigation((iframe, route, data) => {
      console.log(`Navigation: ${route}`, data);
      // Handle navigation logic
    });

    manager.onModal((iframe, action, data) => {
      // Handle modal logic
    });

    // Create iframe
    const container = document.getElementById('iframe-container');
    if (container) {
      createIframe({
        id: 'main-app',
        src: 'http://localhost:3001/iframe-routes/dashboard',
        width: '100%',
        height: '600px'
      }, container);
    }
  }, [manager, createIframe]);

  return (
    <div>
      <h1>Host Application</h1>
      <div id="iframe-container" />
    </div>
  );
}
```

2. **Advanced Integration with Context**:

```typescript
function AdvancedHostApp() {
  const { manager, createIframe, sendToIframe } = useHostIframeManager();
  const [userContext, setUserContext] = useState({
    user: { id: '123', name: 'John', permissions: ['read', 'write'] }
  });

  const loadIframe = async (route: string) => {
    const container = document.getElementById('iframe-container');
    const iframe = await createIframe({
      id: 'dynamic-app',
      src: `http://localhost:3001${route}`,
      width: '100%',
      height: '500px'
    }, container);

    // Send initial context
    await sendToIframe('dynamic-app', MessageTypes.STATE, StateActions.UPDATE, {
      app: userContext
    });
  };

  return (
    <div>
      <button onClick={() => loadIframe('/iframe-routes/orders')}>
        Load Orders
      </button>
      <div id="iframe-container" />
    </div>
  );
}
```

### Iframe Application Setup

1. **Basic Next.js Page**:

```typescript
// pages/iframe-routes/dashboard.tsx
import { useIframeApp } from '../../../iframe-app';

export default function IframeDashboard() {
  const {
    isInitialized,
    context,
    sendStatus,
    navigate,
    showNotification
  } = useIframeApp({
    hostOrigin: 'http://localhost:3000'
  });

  const handleAction = async () => {
    try {
      await sendStatus('info', 'Processing action...');
      // Perform action
      await showNotification('success', 'Action completed!');
    } catch (error) {
      await showNotification('error', 'Action failed');
    }
  };

  if (!isInitialized) {
    return <div>Connecting to host...</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2>Dashboard</h2>
      <p>User: {context?.app?.user?.name}</p>
      <button onClick={handleAction}>Perform Action</button>
      <button onClick={() => navigate('/orders')}>Go to Orders</button>
    </div>
  );
}
```

2. **Form Handling with Modal Support**:

```typescript
// pages/iframe-routes/user-form.tsx
export default function UserForm() {
  const {
    isInitialized,
    context,
    sendData,
    closeModal
  } = useIframeApp({
    hostOrigin: window.location.origin
  });

  const [formData, setFormData] = useState({ name: '', email: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await sendData('form-submission', {
        type: 'user-update',
        data: formData
      });

      if (context?.metadata?.isModal) {
        await closeModal({ success: true, data: formData });
      }
    } catch (error) {
      console.error('Form submission failed:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button type="submit">Submit</button>
      {context?.metadata?.isModal && (
        <button type="button" onClick={() => closeModal({ success: false })}>
          Cancel
        </button>
      )}
    </form>
  );
}
```

## Advanced Scenarios

### Scenario 1: Multi-Step Workflow with Context Preservation

```typescript
// Host handles navigation between steps
manager.onNavigation(async (iframe, route, data) => {
  if (data?.workflow) {
    // Store workflow context
    await iframe.contextManager.updateContext({
      metadata: {
        workflow: data.workflow,
        step: data.step,
        preservedData: data.preservedData
      }
    });
  }
  
  // Navigate to next step
  setCurrentRoute(route);
});

// Iframe preserves context between steps
const { navigate } = useIframeApp(config);

const goToNextStep = async () => {
  await navigate('/step-2', {}, {
    workflow: 'user-onboarding',
    step: 2,
    preservedData: currentStepData
  });
};
```

### Scenario 2: Real-time Data Synchronization

```typescript
// Host broadcasts updates to all iframes
const broadcastUpdate = async (data: any) => {
  await manager.broadcastToIframes(MessageTypes.DATA, 'realtime-update', data);
};

// Iframe listens for real-time updates
const { onMessage } = useIframeApp(config);

useEffect(() => {
  onMessage(MessageTypes.DATA, 'realtime-update', (data) => {
    setRealtimeData(data);
  });
}, [onMessage]);
```

### Scenario 3: Cross-Iframe Communication

```typescript
// Host acts as message relay between iframes
manager.onMessage(MessageTypes.DATA, 'cross-iframe-message', (sourceIframe, payload) => {
  const targetIframeId = payload.data.targetIframe;
  const targetIframe = manager.getIframe(targetIframeId);
  
  if (targetIframe) {
    targetIframe.messenger.send(MessageTypes.DATA, 'message-from-peer', {
      sourceIframe: sourceIframe.id,
      data: payload.data.message
    });
  }
});
```

## Security Considerations

### Origin Validation

Always validate message origins:

```typescript
const messenger = new IframeMessenger({
  targetOrigin: 'https://trusted-domain.com', // Never use '*'
  debug: false // Disable in production
}, false);
```

### Content Security Policy

Configure CSP headers:

```http
Content-Security-Policy: frame-src 'self' https://trusted-iframe-domain.com; 
                        frame-ancestors 'self' https://trusted-parent-domain.com;
```

### Message Sanitization

Sanitize all incoming data:

```typescript
messenger.on(MessageTypes.DATA, (payload) => {
  // Validate and sanitize payload.data
  if (typeof payload.data !== 'object' || !payload.data) {
    throw new Error('Invalid data format');
  }
  
  // Process sanitized data
});
```

## Troubleshooting

### Common Issues

1. **Messages not being received**
   - Verify origins match exactly (including protocol and port)
   - Check iframe has loaded completely
   - Ensure target window is set correctly

2. **Context synchronization failing**
   - Check network connectivity
   - Verify message handlers are registered
   - Look for JavaScript errors in console

3. **Navigation not working**
   - Ensure navigation handlers are set up
   - Check route format and parameters
   - Verify iframe routing is configured

### Debugging Tips

Enable debug mode:

```typescript
const messenger = new IframeMessenger({
  targetOrigin: 'http://localhost:3001',
  debug: true // This will log all messages
}, false);
```

Monitor message flow:

```typescript
// Log all incoming messages
messenger.on('*', (payload) => {
  console.log('Received message:', payload);
});

// Log all outgoing messages  
const originalSend = messenger.send;
messenger.send = async (...args) => {
  console.log('Sending message:', args);
  return originalSend.apply(messenger, args);
};
```

### Performance Considerations

1. **Message Throttling**: Implement rate limiting for high-frequency messages
2. **Context Caching**: Cache context data to avoid repeated requests
3. **Memory Management**: Clean up event listeners and pending messages
4. **Timeout Handling**: Set appropriate timeouts for response messages

## Testing

### Unit Testing

```typescript
// Example Jest test
import { IframeMessenger } from './iframe-messaging-lib';

describe('IframeMessenger', () => {
  let messenger: IframeMessenger;

  beforeEach(() => {
    messenger = new IframeMessenger({
      targetOrigin: 'http://localhost:3000'
    }, false);
  });

  afterEach(() => {
    messenger.destroy();
  });

  test('should send message', async () => {
    const mockPostMessage = jest.fn();
    Object.defineProperty(window, 'parent', {
      value: { postMessage: mockPostMessage }
    });

    await messenger.send('test', 'action', { data: 'test' });
    
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'test',
        action: 'action',
        data: { data: 'test' }
      }),
      'http://localhost:3000'
    );
  });
});
```

### Integration Testing

```typescript
// Example E2E test with Cypress
describe('Iframe Communication', () => {
  it('should send message from iframe to host', () => {
    cy.visit('/host-app');
    
    // Wait for iframe to load
    cy.get('iframe#main-app').should('be.visible');
    
    // Interact with iframe
    cy.get('iframe#main-app').then(($iframe) => {
      const iframe = $iframe[0] as HTMLIFrameElement;
      
      // Simulate user action in iframe
      iframe.contentWindow?.postMessage({
        type: 'test',
        action: 'button-click',
        data: { buttonId: 'submit' }
      }, '*');
    });
    
    // Verify host response
    cy.get('[data-testid="status-message"]')
      .should('contain', 'Message received from iframe');
  });
});
```

This comprehensive system provides a robust foundation for iframe-host communication with context preservation, navigation handling, and modal support. The modular design allows for easy extension and customization based on specific requirements.
