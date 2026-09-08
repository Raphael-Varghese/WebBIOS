/**
 * WebBIOS Network Manager
 * Manages WebSocket proxy connection for guest OS network access.
 * When enabled, QEMU network traffic is tunneled through a local
 * WebSocket proxy that bridges to the host machine's internet.
 */

export class NetworkManager {
  constructor() {
    this.ws = null;
    this.enabled = false;
    this.proxyUrl = 'ws://localhost:8081';
    this.connected = false;
  }

  toggle(el) {
    el.classList.toggle('on');
    this.enabled = el.classList.contains('on');
    this.updateUI();

    if (this.enabled) {
      this.connect();
    } else {
      this.disconnect();
    }

    if (window.App) {
      window.App.showStatus(
        this.enabled ? 'Network enabled. Attempting proxy connection...' : 'Network disabled.',
        this.enabled ? 'info' : 'warn'
      );
    }
  }

  async connect() {
    try {
      this.ws = new WebSocket(this.proxyUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.connected = true;
        this.updateUI();
        document.getElementById('proxy-conn-status').textContent = 'Connected';
        document.getElementById('proxy-conn-status').className = 'value-ok';
        document.getElementById('proxy-status').textContent = 'Connected';
        document.getElementById('proxy-status').className = 'value-ok';
        document.getElementById('net-indicator').textContent = 'Network On';
        document.getElementById('net-indicator').classList.remove('offline');
        document.getElementById('net-indicator').classList.add('online');
        console.log('[NetworkManager] Proxy connected');
      };

      this.ws.onmessage = (event) => {
        if (window.App?.vm?.onNetworkPacket) {
          window.App.vm.onNetworkPacket(new Uint8Array(event.data));
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.updateUI();
        document.getElementById('proxy-conn-status').textContent = 'Disconnected';
        document.getElementById('proxy-conn-status').className = 'value-warn';
        document.getElementById('proxy-status').textContent = 'Disconnected';
        document.getElementById('proxy-status').className = 'value-warn';
        document.getElementById('net-indicator').textContent = 'Network Off';
        document.getElementById('net-indicator').classList.remove('online');
        document.getElementById('net-indicator').classList.add('offline');
      };

      this.ws.onerror = (err) => {
        console.error('[NetworkManager] WebSocket error:', err);
        if (window.App) {
          window.App.showStatus(
            `Network proxy connection failed. Make sure server.py is running with WebSocket support on port 8081`,
            'error'
          );
        }
      };
    } catch (e) {
      console.error('[NetworkManager] Failed to connect:', e);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.updateUI();
  }

  updateUI() {
    const indicator = document.getElementById('net-indicator');
    if (!indicator) return;
    if (this.enabled && this.connected) {
      indicator.textContent = 'Network On';
      indicator.classList.add('online');
      indicator.classList.remove('offline');
    } else {
      indicator.textContent = 'Network Off';
      indicator.classList.remove('online');
      indicator.classList.add('offline');
    }
  }

  sendPacket(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  isEnabled() {
    return this.enabled;
  }

  isConnected() {
    return this.connected;
  }
}