/**
 * Usage Examples
 * Demonstrates how to use the iframe messaging system in both host and iframe applications
 */

// ==================== HOST APPLICATION EXAMPLES ====================

import React, { useEffect, useState } from 'react';
import { useHostIframeManager } from './host-iframe-manager';

// Example 1: Basic Host Component
export function HostAppExample() {
  const { manager, createIframe, getIframe, sendToIframe } = useHostIframeManager();
  const [currentPage, setCurrentPage] = useState('/dashboard');

  useEffect(() => {
    // Setup navigation handler
    manager.onNavigation((iframe, route, data) => {
      console.log(`Iframe ${iframe.id} navigated to ${route}`, data);
      
      if (data?.external) {
        // Handle external navigation
        window.location.href = data.url;
      } else {
        // Update host application state
        setCurrentPage(route);
      }
    });

    // Setup modal handler
    manager.onModal((iframe, action, data) => {
      if (action === 'open') {
        console.log(`Opening modal from iframe ${iframe.id}`, data);
        // Handle modal opening logic
      } else {
        console.log(`Closing modal from iframe ${iframe.id}`, data);
        // Handle modal closing logic
      }
    });

    // Create initial iframe
    const container = document.getElementById('iframe-container');
    if (container) {
      createIframe({
        id: 'main-app',
        src: 'http://localhost:3001/iframe-app',
        width: '100%',
        height: '600px',
        title: 'Main Application'
      }, container);
    }
  }, [manager, createIframe]);

  const handleSendMessage = async () => {
    try {
      const response = await sendToIframe(
        'main-app',
        'data',
        'request',
        { type: 'user-info' },
        true
      );
      console.log('Response from iframe:', response);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  return (
    <div>
      <h1>Host Application</h1>
      <p>Current Page: {currentPage}</p>
      <button onClick={handleSendMessage}>
        Send Message to Iframe
      </button>
      <div id="iframe-container" style={{ width: '100%', height: '600px' }} />
    </div>
  );
}

// Example 2: Advanced Host with Context Management
export function AdvancedHostExample() {
  const { manager, createIframe, iframes } = useHostIframeManager();
  const [userContext, setUserContext] = useState({
    user: {
      id: '123',
      name: 'John Doe',
      email: 'john@example.com',
      permissions: ['read', 'write']
    },
    session: {
      id: 'session-123',
      expires: Date.now() + 3600000,
      token: 'jwt-token-here'
    }
  });

  useEffect(() => {
    // Broadcast user context to all iframes when it changes
    if (iframes.length > 0) {
      manager.broadcastToIframes('state', 'update', {
        app: userContext
      });
    }
  }, [userContext, iframes, manager]);

  const loadIframeApp = async (appId: string, route: string) => {
    const container = document.getElementById(`iframe-${appId}`);
    if (!container) return;

    const iframe = await createIframe({
      id: appId,
      src: `http://localhost:3001${route}`,
      width: '100%',
      height: '500px',
      title: `App ${appId}`
    }, container);

    // Send initial context
    await iframe.contextManager.updateContext({
      app: userContext,
      navigation: {
        currentRoute: route
      }
    });
  };

  return (
    <div>
      <h1>Advanced Host Application</h1>
      
      <div>
        <button onClick={() => loadIframeApp('orders', '/orders')}>
          Load Orders App
        </button>
        <button onClick={() => loadIframeApp('products', '/products')}>
          Load Products App
        </button>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
        <div id="iframe-orders" style={{ flex: 1, height: '500px' }} />
        <div id="iframe-products" style={{ flex: 1, height: '500px' }} />
      </div>

      <div>
        <h3>Active Iframes:</h3>
        <ul>
          {iframes.map(iframe => (
            <li key={iframe.id}>
              {iframe.id} - {iframe.isLoaded ? 'Loaded' : 'Loading...'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ==================== IFRAME APPLICATION EXAMPLES ====================

import { useIframeApp, useIframeResize } from './iframe-app';

// Example 3: Basic Iframe Component
export function IframeAppExample() {
  const {
    isInitialized,
    context,
    sendStatus,
    requestData,
    navigate,
    openModal,
    showNotification
  } = useIframeApp({
    hostOrigin: 'http://localhost:3000',
    debug: true
  });

  const [userData, setUserData] = useState(null);
  const dimensions = useIframeResize();

  useEffect(() => {
    if (!isInitialized) return;

    // Request user data from host
    requestData('user-info')
      .then(data => {
        setUserData(data);
        sendStatus('success', 'User data loaded successfully');
      })
      .catch(error => {
        console.error('Failed to load user data:', error);
        sendStatus('error', 'Failed to load user data');
      });
  }, [isInitialized, requestData, sendStatus]);

  const handleNavigateToOrders = () => {
    navigate('/orders', { userId: userData?.id });
  };

  const handleOpenUserModal = async () => {
    try {
      const result = await openModal('/user-settings', { userId: userData?.id });
      console.log('Modal result:', result);
      showNotification('success', 'Settings updated successfully');
    } catch (error) {
      showNotification('error', 'Failed to update settings');
    }
  };

  const handleExternalLink = () => {
    // This will be handled by the host
    window.parent.postMessage({
      type: 'navigation',
      action: 'navigate_to',
      data: {
        url: 'https://example.com',
        target: '_blank',
        external: true
      }
    }, '*');
  };

  if (!isInitialized) {
    return <div>Connecting to host application...</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2>Iframe Application</h2>
      
      {context && (
        <div>
          <p>Current Route: {context.navigation.currentRoute}</p>
          <p>User: {context.app?.user?.name}</p>
          <p>Dimensions: {dimensions.width} x {dimensions.height}</p>
        </div>
      )}

      <div>
        <button onClick={handleNavigateToOrders}>
          Navigate to Orders
        </button>
        <button onClick={handleOpenUserModal}>
          Open User Settings Modal
        </button>
        <button onClick={handleExternalLink}>
          Open External Link
        </button>
      </div>

      {userData && (
        <div>
          <h3>User Data:</h3>
          <pre>{JSON.stringify(userData, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

// Example 4: Complex Iframe App with Form Handling
export function ComplexIframeApp() {
  const {
    isInitialized,
    context,
    sendData,
    sendStatus,
    onMessage,
    offMessage,
    closeModal
  } = useIframeApp({
    hostOrigin: window.location.origin,
    debug: process.env.NODE_ENV === 'development'
  });

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    preferences: {}
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isInitialized) return;

    // Listen for form data from host
    onMessage('data', 'form-prefill', (data) => {
      setFormData(prev => ({ ...prev, ...data }));
    });

    // Listen for form submission commands
    onMessage('ui', 'submit-form', async () => {
      await handleSubmit();
    });

    return () => {
      offMessage('data', 'form-prefill');
      offMessage('ui', 'submit-form');
    };
  }, [isInitialized, onMessage, offMessage]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      // Validate form
      if (!formData.name || !formData.email) {
        sendStatus('error', 'Please fill in all required fields');
        return;
      }

      // Send data to host
      await sendData('form-submission', {
        type: 'user-preferences',
        data: formData,
        timestamp: Date.now()
      });

      sendStatus('success', 'Form submitted successfully');
      
      // If this is a modal, close it with the result
      if (context?.metadata?.isModal) {
        closeModal({ success: true, data: formData });
      }

    } catch (error) {
      console.error('Form submission failed:', error);
      sendStatus('error', 'Form submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (context?.metadata?.isModal) {
      closeModal({ success: false });
    } else {
      // Navigate back or to a safe route
      window.history.back();
    }
  };

  if (!isInitialized) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '600px' }}>
      <h2>User Preferences</h2>
      
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <div style={{ marginBottom: '15px' }}>
          <label>
            Name *
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              style={{ display: 'block', width: '100%', marginTop: '5px' }}
              required
            />
          </label>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>
            Email *
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              style={{ display: 'block', width: '100%', marginTop: '5px' }}
              required
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button 
            type="submit" 
            disabled={isSubmitting}
            style={{ padding: '10px 20px' }}
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
          
          <button 
            type="button" 
            onClick={handleCancel}
            style={{ padding: '10px 20px' }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// Example 5: Next.js Page Implementation
// pages/iframe/orders.tsx
export default function IframeOrdersPage() {
  const {
    isInitialized,
    context,
    sendStatus,
    requestData,
    navigate,
    requestResize
  } = useIframeApp({
    hostOrigin: process.env.NEXT_PUBLIC_HOST_ORIGIN || 'http://localhost:3000'
  });

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isInitialized) return;

    loadOrders();
  }, [isInitialized]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      
      // Request orders data from host
      const ordersData = await requestData('orders', {
        userId: context?.app?.user?.id,
        limit: 50
      });
      
      setOrders(ordersData);
      sendStatus('success', `Loaded ${ordersData.length} orders`);
      
      // Adjust iframe height based on content
      await requestResize('100%', Math.max(400, ordersData.length * 60 + 200));
      
    } catch (error) {
      console.error('Failed to load orders:', error);
      sendStatus('error', 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const handleOrderClick = (orderId: string) => {
    navigate(`/orders/${orderId}`, { orderId });
  };

  if (!isInitialized) {
    return <div>Connecting...</div>;
  }

  if (loading) {
    return <div>Loading orders...</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2>Orders</h2>
      
      <div>
        {orders.map(order => (
          <div 
            key={order.id} 
            onClick={() => handleOrderClick(order.id)}
            style={{ 
              padding: '10px', 
              border: '1px solid #ccc', 
              marginBottom: '10px',
              cursor: 'pointer'
            }}
          >
            <strong>Order #{order.id}</strong>
            <p>Status: {order.status}</p>
            <p>Total: ${order.total}</p>
          </div>
        ))}
      </div>

      {orders.length === 0 && (
        <p>No orders found.</p>
      )}
    </div>
  );
}
