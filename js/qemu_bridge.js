/**
 * WebBIOS QEMU Bridge
 * THE CRITICAL P0 FILE.
 *
 * This module:
 *  1. Loads the QEMU-WASM module (out.js)
 *  2. Writes ISO files into QEMU's virtual filesystem
 *  3. Creates virtual disk images in QEMU's FS
 *  4. Constructs QEMU command-line arguments
 *  5. Calls module.callMain(argv) to start the VM
 *  6. Bridges serial output to xterm.js (terminal mode)
 *  7. Bridges VGA framebuffer to <canvas> (GUI mode)
 *  8. Bridges keyboard/mouse input into QEMU
 *  9. Bridges network packets to/from the WebSocket proxy
 */

export class QEMUBridge {
  constructor({ onStatus, onVMStart, onVMStop }) {
    this.module = null;
    this.running = false;
    this.onStatus = onStatus || (() => {});
    this.onVMStart = onVMStart || (() => {});
    this.onVMStop = onVMStop || (() => {});
    this.virtualDisk = null;
    this.currentISO = null;
    this.displayMode = 'auto';
    this.terminal = null;
    this.framebufferPoller = null;
    this.serialBuffer = '';
  }

  // ============================================================
  // 1. MODULE LOADING
  // ============================================================

  async initModule() {
    if (!window.QEMUFactory) {
      this.onStatus('QEMU module loader not available. Make sure out.js is in the same directory.', 'error');
      return;
    }

    this.updateLoadStatus('qemu-mod-status', 'Loading...', 'value-warn');
    this.updateProgress(10);

    try {
      const module = await window.QEMUFactory({
        print: (text) => this.onSerialOutput(text + '\n'),
        printErr: (text) => this.onSerialOutput(text + '\n'),
        onRuntimeInitialized: () => {
          console.log('[QEMUBridge] QEMU runtime initialized');
          this.onStatus('QEMU runtime initialized and ready.', 'ok');
          this.updateLoadStatus('qemu-mod-status', 'Loaded', 'value-ok');
          this.updateLoadStatus('wasm-status', 'Loaded', 'value-ok');
          this.updateLoadStatus('bios-status', 'Loaded (packaged)', 'value-ok');
          this.updateLoadStatus('vga-status', 'Loaded (packaged)', 'value-ok');
          document.getElementById('qemu-dot')?.classList.add('active');
          document.getElementById('footer-msg').textContent = 'QEMU-WASM Ready';
          document.getElementById('footer-msg').style.color = 'var(--phosphor)';
          this.updateProgress(100);
        },
        setStatus: (text) => {
          console.log('[QEMU status]', text);
          if (text && text.includes('download')) this.updateProgress(20);
          if (text && text.includes('compile')) this.updateProgress(60);
          if (text && text.includes('run')) this.updateProgress(90);
        },
        INITIAL_MEMORY: 256 * 1024 * 1024,
      });

      this.module = module;
      console.log('[QEMUBridge] Module loaded:', module);

    } catch (err) {
      console.error('[QEMUBridge] Failed to load QEMU module:', err);
      this.onStatus(`Failed to load QEMU: ${err.message}. Make sure out.js and .wasm files are present.`, 'error');
      this.updateLoadStatus('qemu-mod-status', `Failed: ${err.message}`, 'value-error');
      this.updateProgress(0);
    }
  }

  // ============================================================
  // 2. VIRTUAL DISK CREATION
  // ============================================================

  createDisk() {
    const sizeGB = parseInt(document.getElementById('disk-slider')?.value || 4);
    const sizeBytes = sizeGB * 1024 * 1024 * 1024;

    if (!this.module) {
      this.onStatus('QEMU not loaded yet. Wait for module initialization.', 'warn');
      return;
    }

    try {
      const diskPath = '/pack/virtio-disk0.raw';
      if (sizeGB <= 1) {
        const diskData = new Uint8Array(sizeBytes);
        this.module.FS.writeFile(diskPath, diskData);
      } else {
        const initialSize = Math.min(sizeBytes, 512 * 1024 * 1024);
        const diskData = new Uint8Array(initialSize);
        this.module.FS.writeFile(diskPath, diskData);
        console.warn(`[QEMUBridge] Disk capped at 512MB initial due to MEMFS limits. Full ${sizeGB}GB requires IDBFS backend.`);
      }

      this.virtualDisk = { name: 'virtio-disk0.raw', sizeGB, path: diskPath };

      const hddStatus = document.getElementById('hdd-status');
      if (hddStatus) {
        hddStatus.textContent = `${sizeGB} GB / Created`;
        hddStatus.className = 'boot-status connected';
      }

      this.onStatus(`Virtual disk created: ${sizeGB} GB`, 'ok');

    } catch (err) {
      console.error('[QEMUBridge] Failed to create disk:', err);
      this.onStatus(`Failed to create virtual disk: ${err.message}`, 'error');
    }
  }

  // ============================================================
  // 3. ISO TO FILESYSTEM BRIDGE
  // ============================================================

  async writeISOToFS(isoFile) {
    if (!this.module) {
      throw new Error('QEMU module not loaded');
    }
    if (!isoFile) {
      throw new Error('No ISO file provided');
    }

    this.onStatus(`Reading ISO: ${isoFile.name}...`, 'info');

    try {
      const arrayBuffer = await isoFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const isoPath = `/pack/${isoFile.name}`;

      this.module.FS.writeFile(isoPath, uint8Array);

      this.currentISO = { file: isoFile, path: isoPath, size: isoFile.size };
      console.log(`[QEMUBridge] ISO written to ${isoPath} (${uint8Array.length} bytes)`);
      this.onStatus(`ISO loaded into QEMU filesystem: ${isoFile.name}`, 'ok');

      return isoPath;

    } catch (err) {
      console.error('[QEMUBridge] Failed to write ISO:', err);
      throw err;
    }
  }

  // ============================================================
  // 4. QEMU ARGUMENT BUILDER
  // ============================================================

  buildArgv(options) {
    const config = window.App?.config?.getAll() || {};
    const ram = config.ram || 1024;
    const cpus = config.cpus || 2;
    const virtio = config.virtio !== false;
    const acpi = config.acpi !== false;
    const uefi = config.uefi === true;
    const bootMenu = config.bootMenu !== false;
    const network = config.network === true;
    const extraArgs = config.extraArgs || '';

    const argv = [
      'qemu-system-x86_64',
      '-m', String(ram),
      '-smp', String(cpus),
      '-cpu', 'qemu64',
      '-no-reboot',
    ];

    const machineFlags = ['pc'];
    if (acpi) machineFlags.push('acpi=on');
    argv.push('-machine', machineFlags.join(','));

    const bootOrder = [];
    if (options.iso) bootOrder.push('d');
    bootOrder.push('c');
    if (network) bootOrder.push('n');
    const bootStr = `order=${bootOrder.join('')}`;
    argv.push('-boot', bootMenu ? `${bootStr},menu=on` : bootStr);

    if (options.iso) {
      if (virtio) {
        argv.push('-drive', `file=${options.iso},format=raw,if=none,id=cdrom0,media=cdrom,readonly=on`);
        argv.push('-device', 'ide-cd,drive=cdrom0,bus=ide.0,unit=0');
      } else {
        argv.push('-cdrom', options.iso);
      }
    }

    if (options.hdd && this.virtualDisk) {
      if (virtio) {
        argv.push('-drive', `file=${this.virtualDisk.path},format=raw,if=virtio,index=0`);
      } else {
        argv.push('-hda', this.virtualDisk.path);
      }
    }

    argv.push('-serial', 'stdio');

    if (options.displayMode === 'canvas' || options.displayMode === 'auto') {
      argv.push('-vga', 'std');
    }

    if (network && window.App?.network?.isConnected?.()) {
      argv.push('-netdev', 'user,id=net0,hostfwd=tcp::8082-:22');
      argv.push('-device', 'e1000,netdev=net0');
    }

    if (uefi) {
      argv.push('-bios', '/pack/OVMF_CODE.fd');
    }

    if (extraArgs.trim()) {
      argv.push(...extraArgs.trim().split(/\s+/));
    }

    console.log('[QEMUBridge] QEMU argv:', argv.join(' '));
    return argv;
  }

  // ============================================================
  // 5. BOOT ENTRY POINTS
  // ============================================================

  async bootSelected() {
    const device = window.App?.boot?.getSelectedDevice?.();

    if (device === 'cdrom') {
      const iso = window.App?.iso?.get?.(0);
      if (!iso) {
        this.onStatus('No ISO loaded. Drop an ISO file in the ISO Library tab first.', 'error');
        return;
      }
      await this.bootISO(iso);

    } else if (device === 'hdd') {
      if (!this.virtualDisk) {
        this.onStatus('No virtual disk created. Click "Create Disk" first.', 'error');
        return;
      }
      await this.bootHDD();

    } else if (device === 'pxe') {
      this.onStatus('PXE boot requires the network proxy server. Enable network in the Network tab.', 'warn');
    }
  }

  async bootIso(index) {
    const iso = window.App?.iso?.get?.(index);
    if (!iso) {
      this.onStatus('Invalid ISO index.', 'error');
      return;
    }
    await this.bootISO(iso);
  }

  async bootISO(isoFile) {
    if (!this.module) {
      this.onStatus('QEMU module not loaded yet. Wait for initialization or check console for errors.', 'error');
      return;
    }
    if (this.running) {
      this.onStatus('A VM is already running. Stop it first.', 'warn');
      return;
    }

    const displayMode = window.App?.display?.guessDisplayMode?.(isoFile.name) || 'terminal';
    window.App?.display?.setMode?.(displayMode, isoFile.name);

    try {
      const isoPath = await this.writeISOToFS(isoFile);

      const argv = this.buildArgv({
        iso: isoPath,
        hdd: !!this.virtualDisk,
        displayMode,
      });

      this.setupDisplayBridges(displayMode);
      this.setupInputBridge();

      this.running = true;
      this.onVMStart();
      this.updateVMStatus(`Booting ${isoFile.name}...`);

      requestAnimationFrame(() => {
        try {
          this.module.callMain(argv.slice(1));
        } catch (err) {
          console.error('[QEMUBridge] QEMU execution error:', err);
          this.onStatus(`VM crashed: ${err.message}`, 'error');
          this.stop();
        }
      });

    } catch (err) {
      console.error('[QEMUBridge] Boot failed:', err);
      this.onStatus(`Boot failed: ${err.message}`, 'error');
    }
  }

  async bootHDD() {
    if (!this.module) {
      this.onStatus('QEMU module not loaded yet.', 'error');
      return;
    }
    if (!this.virtualDisk) {
      this.onStatus('No virtual disk available.', 'error');
      return;
    }
    if (this.running) {
      this.onStatus('A VM is already running.', 'warn');
      return;
    }

    const argv = this.buildArgv({
      iso: null,
      hdd: true,
      displayMode: 'terminal',
    });

    this.setupDisplayBridges('terminal');
    this.setupInputBridge();

    this.running = true;
    this.onVMStart();
    this.updateVMStatus('Booting from virtual hard disk...');

    requestAnimationFrame(() => {
      try {
        this.module.callMain(argv.slice(1));
      } catch (err) {
        console.error('[QEMUBridge] QEMU execution error:', err);
        this.onStatus(`VM crashed: ${err.message}`, 'error');
        this.stop();
      }
    });
  }

  // ============================================================
  // 6. DISPLAY BRIDGES
  // ============================================================

  setupDisplayBridges(mode) {
    if (mode === 'canvas' || mode === 'auto') {
      this.setupFramebufferPoll();
    }
  }

  onSerialOutput(text) {
    if (window.App?.display?.writeToTerminal) {
      window.App.display.writeToTerminal(text);
    }
    this.serialBuffer += text;
    console.log('[QEMU serial]', text.trimEnd());
  }

  setupFramebufferPoll() {
    if (this.framebufferPoller) {
      clearInterval(this.framebufferPoller);
    }

    this.framebufferPoller = setInterval(() => {
      this.pollFramebuffer();
    }, 33);

    console.log('[QEMUBridge] Framebuffer polling started (30fps)');
  }

  pollFramebuffer() {
    if (!this.running) return;

    const sdlCanvas = this.module?.canvas;
    if (sdlCanvas && sdlCanvas !== document.getElementById('vm-canvas')) {
      const ctx = document.getElementById('vm-canvas').getContext('2d');
      ctx.drawImage(sdlCanvas, 0, 0);
      return;
    }

    if (this.module?.SDL?.screens?.[0]?.canvas) {
      const src = this.module.SDL.screens[0].canvas;
      const dst = document.getElementById('vm-canvas');
      const ctx = dst.getContext('2d');
      ctx.drawImage(src, 0, 0);
    }
  }

  // ============================================================
  // 7. INPUT BRIDGE (Keyboard)
  // ============================================================

  setupInputBridge() {
    const canvas = document.getElementById('vm-canvas');
    const terminalEl = document.getElementById('vm-terminal');

    this.keyHandler = (e) => {
      if (!this.running) return;
      if (!document.getElementById('vm-display').classList.contains('active')) return;

      if (['F5', 'F12', 'Tab', 'Alt', 'F4'].includes(e.key)) {
        e.preventDefault();
      }

      const scancode = this.domKeyToScancode(e.key, e.code, e.type === 'keydown');
      if (scancode !== null) {
        this.sendScancode(scancode);
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', this.keyHandler);
    document.addEventListener('keyup', this.keyHandler);

    canvas.addEventListener('click', () => {
      if (this.running) canvas.requestPointerLock?.();
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) {
        canvas.addEventListener('mousemove', this.mouseMoveHandler);
        canvas.addEventListener('mousedown', this.mouseButtonHandler);
        canvas.addEventListener('mouseup', this.mouseButtonHandler);
      } else {
        canvas.removeEventListener('mousemove', this.mouseMoveHandler);
        canvas.removeEventListener('mousedown', this.mouseButtonHandler);
        canvas.removeEventListener('mouseup', this.mouseButtonHandler);
      }
    });
  }

  domKeyToScancode(key, code, down) {
    const makeCodes = {
      'Escape': 0x01, 'F1': 0x3b, 'F2': 0x3c, 'F3': 0x3d, 'F4': 0x3e,
      'F5': 0x3f, 'F6': 0x40, 'F7': 0x41, 'F8': 0x42, 'F9': 0x43,
      'F10': 0x44, 'F11': 0x57, 'F12': 0x58,
      'Backquote': 0x29, '1': 0x02, '2': 0x03, '3': 0x04, '4': 0x05,
      '5': 0x06, '6': 0x07, '7': 0x08, '8': 0x09, '9': 0x0a, '0': 0x0b,
      'Minus': 0x0c, 'Equal': 0x0d, 'Backspace': 0x0e,
      'Tab': 0x0f, 'q': 0x10, 'w': 0x11, 'e': 0x12, 'r': 0x13, 't': 0x14,
      'y': 0x15, 'u': 0x16, 'i': 0x17, 'o': 0x18, 'p': 0x19,
      'BracketLeft': 0x1a, 'BracketRight': 0x1b, 'Enter': 0x1c,
      'ControlLeft': 0x1d,
      'a': 0x1e, 's': 0x1f, 'd': 0x20, 'f': 0x21, 'g': 0x22, 'h': 0x23,
      'j': 0x24, 'k': 0x25, 'l': 0x26, 'Semicolon': 0x27, 'Quote': 0x28,
      'ShiftLeft': 0x2a, 'Backslash': 0x2b,
      'z': 0x2c, 'x': 0x2d, 'c': 0x2e, 'v': 0x2f, 'b': 0x30, 'n': 0x31,
      'm': 0x32, 'Comma': 0x33, 'Period': 0x34, 'Slash': 0x35,
      'ShiftRight': 0x36,
      'AltLeft': 0x38, 'Space': 0x39, 'CapsLock': 0x3a,
      'ArrowUp': 0x48, 'ArrowDown': 0x50, 'ArrowLeft': 0x4b, 'ArrowRight': 0x4d,
    };

    let scancode = makeCodes[key] || makeCodes[code] || null;
    if (scancode === null) return null;
    if (!down) scancode |= 0x80;
    return scancode;
  }

  sendScancode(scancode) {
    console.log('[QEMUBridge] Scancode:', scancode.toString(16));
    if (this.module?._qemu_input_event_send_keycode) {
      this.module._qemu_input_event_send_keycode(scancode & 0x7f, !(scancode & 0x80));
    }
  }

  mouseMoveHandler = (e) => {
    if (!this.running) return;
    if (this.module?._qemu_input_queue_rel) {
      this.module._qemu_input_queue_rel(0, e.movementX);
      this.module._qemu_input_queue_rel(1, e.movementY);
    }
  };

  mouseButtonHandler = (e) => {
    if (!this.running) return;
    const buttonMap = { 0: 0x01, 1: 0x04, 2: 0x02 };
    const button = buttonMap[e.button] || 0;
    const down = e.type === 'mousedown';
    if (this.module?._qemu_input_queue_btn) {
      this.module._qemu_input_queue_btn(button, down);
    }
  };

  // ============================================================
  // 8. NETWORK BRIDGE
  // ============================================================

  onNetworkPacket(packet) {
    if (this.module?._qemu_netdev_receive) {
      this.module._qemu_netdev_receive(packet);
    }
  }

  sendNetworkPacket(packet) {
    window.App?.network?.sendPacket?.(packet);
  }

  // ============================================================
  // 9. VM CONTROL
  // ============================================================

  stop() {
    if (!this.running) return;

    this.running = false;

    if (this.framebufferPoller) {
      clearInterval(this.framebufferPoller);
      this.framebufferPoller = null;
    }

    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      document.removeEventListener('keyup', this.keyHandler);
      this.keyHandler = null;
    }

    if (this.module?._qemu_system_shutdown_request) {
      try { this.module._qemu_system_shutdown_request(); } catch (e) {}
    }

    this.onVMStop();
    this.onStatus('VM stopped.', 'info');
    console.log('[QEMUBridge] VM stopped');
  }

  reset() {
    this.stop();
    setTimeout(() => this.bootSelected(), 300);
  }

  fullscreen() {
    const canvas = document.getElementById('vm-canvas');
    const terminal = document.getElementById('vm-terminal');
    const target = canvas.style.display !== 'none' ? canvas : terminal;
    target.requestFullscreen?.();
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  updateLoadStatus(id, text, className) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text;
      el.className = className;
    }
  }

  updateProgress(percent) {
    const bar = document.getElementById('qemu-progress');
    const fill = document.getElementById('qemu-progress-fill');
    if (bar && fill) {
      bar.classList.toggle('show', percent > 0 && percent < 100);
      fill.style.width = percent + '%';
    }
  }

  updateVMStatus(text) {
    const el = document.getElementById('vm-status');
    if (el) el.textContent = text;
  }
}