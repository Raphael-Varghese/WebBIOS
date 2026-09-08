/**
 * WebBIOS P0 - Main Application Orchestrator
 */

import { ConfigManager } from './config.js';
import { ISOManager } from './iso-manager.js';
import { BootManager } from './boot-manager.js';
import { DisplayManager } from './display-manager.js';
import { NetworkManager } from './network-manager.js';
import { QEMUBridge } from './qemu-bridge.js';

const App = {
  config: null,
  iso: null,
  boot: null,
  display: null,
  network: null,
  vm: null,

  init() {
    this.config = new ConfigManager();
    this.iso = new ISOManager();
    this.boot = new BootManager();
    this.display = new DisplayManager();
    this.network = new NetworkManager();
    this.vm = new QEMUBridge({
      onStatus: (msg, type) => this.showStatus(msg, type),
      onVMStart: () => this.onVMStart(),
      onVMStop: () => this.onVMStop(),
    });

    this.bindNavigation();
    this.runBootSequence();
    this.updateSystemInfo();
    setInterval(() => this.updateSystemInfo(), 1000);
    this.checkSAB();
    this.setupQEMULoader();

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.vm.stop();
      if (e.key === 'F10') { e.preventDefault(); this.config.save(); }
    });

    console.log('[WebBIOS] Initialized');
  },

  bindNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.dataset.tab;
        navItems.forEach(n => n.classList.remove('active'));
        tabContents.forEach(t => t.classList.remove('active'));
        item.classList.add('active');
        document.getElementById(`tab-${tab}`).classList.add('active');
      });
    });
  },

  runBootSequence() {
    const lines = [
      { text: 'WebBIOS v2.4.1 (QEMU-WASM) - Web-Based Firmware Interface', type: 'info', delay: 100 },
      { text: 'Copyright (C) 2024 WebBIOS Project. All rights reserved.', type: 'info', delay: 50 },
      { text: '', type: 'info', delay: 20 },
      { text: 'Initializing QEMU System Emulator...', type: 'info', delay: 120 },
      { text: 'WASM Module: Loading...', type: 'warn', delay: 100 },
      { text: '', type: 'ok', delay: 20 },
      { text: `CPU: Virtual x86_64 Processor @ ${navigator.hardwareConcurrency || 'unknown'} cores`, type: 'ok', delay: 80 },
      { text: 'TCG (Tiny Code Generator): JIT enabled', type: 'ok', delay: 80 },
      { text: `SMP: up to ${Math.min(4, navigator.hardwareConcurrency || 2)} vCPUs supported`, type: 'ok', delay: 60 },
      { text: '', type: 'ok', delay: 20 },
      { text: 'Memory Test: Checking available host memory...', type: 'info', delay: 150 },
      { text: `Host RAM detected: ${navigator.deviceMemory || 'unknown'} GB (approx)`, type: 'ok', delay: 80 },
      { text: 'Guest RAM configured: 1024 MB', type: 'ok', delay: 60 },
      { text: '', type: 'ok', delay: 20 },
      { text: 'Detecting virtual storage devices...', type: 'info', delay: 100 },
      { text: 'VirtIO Disk 0: Not created', type: 'warn', delay: 80 },
      { text: 'CD-ROM (IDE): No media', type: 'warn', delay: 80 },
      { text: '', type: 'ok', delay: 20 },
      { text: 'Network: Not configured (toggle in Network tab)', type: 'warn', delay: 80 },
      { text: '', type: 'ok', delay: 20 },
      { text: 'Press any key to enter setup, or wait for automatic boot...', type: 'info', delay: 200 },
    ];

    const container = document.getElementById('boot-content');
    let i = 0;
    const next = () => {
      if (i >= lines.length) {
        setTimeout(() => document.getElementById('boot-screen').classList.add('hidden'), 1200);
        return;
      }
      const line = lines[i];
      const div = document.createElement('div');
      div.className = `boot-line ${line.type}`;
      div.textContent = line.text;
      container.appendChild(div);
      i++;
      setTimeout(next, line.delay);
    };
    next();

    const skip = () => {
      document.getElementById('boot-screen').classList.add('hidden');
      document.removeEventListener('keydown', skip);
      document.getElementById('boot-screen').removeEventListener('click', skip);
    };
    document.addEventListener('keydown', skip);
    document.getElementById('boot-screen').addEventListener('click', skip);
  },

  updateSystemInfo() {
    const now = new Date();
    document.getElementById('sys-date').textContent = now.toLocaleDateString();
    document.getElementById('sys-time').textContent = now.toLocaleTimeString();
    document.getElementById('platform').textContent = navigator.platform;
    document.getElementById('host-cores').textContent = navigator.hardwareConcurrency || 'unknown';
    document.getElementById('host-ram').textContent = navigator.deviceMemory ? navigator.deviceMemory + ' GB (approx)' : 'unknown';
    document.getElementById('user-agent').textContent = navigator.userAgent;
  },

  checkSAB() {
    const supported = typeof SharedArrayBuffer !== 'undefined';
    const el = document.getElementById('sab-status');
    el.textContent = supported ? 'Enabled' : 'Disabled / Blocked';
    el.className = supported ? 'value-ok' : 'value-error';
    if (!supported) {
      this.showStatus('SharedArrayBuffer not available. Use server.py with COOP/COEP headers. Do not open file:// directly.', 'error');
    }
  },

  setupQEMULoader() {
    document.addEventListener('qemu-loader-ready', () => {
      console.log('[WebBIOS] QEMU loader script ready');
      this.vm.initModule();
    });
    if (window.QEMUFactory) {
      this.vm.initModule();
    }
  },

  showStatus(msg, type = 'info') {
    const el = document.getElementById('status-msg');
    el.className = `status-msg ${type} show`;
    el.textContent = msg;
    clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => el.classList.remove('show'), 6000);
    console.log(`[WebBIOS][${type}] ${msg}`);
  },

  onVMStart() {
    document.getElementById('vm-display').classList.add('active');
    document.getElementById('footer-msg').textContent = 'VM Running';
    document.getElementById('footer-msg').style.color = 'var(--phosphor)';
  },

  onVMStop() {
    document.getElementById('vm-display').classList.remove('active');
    document.getElementById('footer-msg').textContent = 'WebBIOS Ready';
    document.getElementById('footer-msg').style.color = '';
  },
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());