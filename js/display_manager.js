/**
 * WebBIOS Display Manager
 * Manages xterm.js (serial/terminal) and Canvas (VGA) display modes.
 * Auto-detect: uses terminal for text-mode ISOs, canvas for GUI ISOs.
 */

export class DisplayManager {
  constructor() {
    this.mode = 'auto';
    this.terminal = null;
    this.fitAddon = null;
    this.canvas = document.getElementById('vm-canvas');
    this.terminalEl = document.getElementById('vm-terminal');
    this.isGUIGuess = false;
  }

  guessDisplayMode(isoName) {
    const name = (isoName || '').toLowerCase();
    const guiPatterns = [
      /windows/, /win98/, /winxp/, /win10/, /win11/,
      /ubuntu.*desktop/, /fedora.*workstation/, /debian.*live/,
      /arch.*iso/, /manjaro/, /pop-os/, /elementary/,
      /kali.*live/, /tails/, /zorin/, /mint.*iso/,
    ];
    const textPatterns = [
      /alpine/, /debian.*netinst/, /ubuntu.*server/, /centos.*stream/,
      /arch.*net/, /tinycore/, /dsl/, /freedos/, /msdos/,
      /buildroot/, /openwrt/, /pfsense/, /vyos/,
    ];
    const isText = textPatterns.some(p => p.test(name));
    const isGUI = guiPatterns.some(p => p.test(name));
    if (isText) return 'terminal';
    if (isGUI) return 'canvas';
    return 'terminal';
  }

  setMode(mode, isoName = null) {
    this.mode = mode;
    const actualMode = mode === 'auto' && isoName
      ? this.guessDisplayMode(isoName)
      : mode;

    document.getElementById('btn-term')?.classList.toggle('primary', actualMode === 'terminal');
    document.getElementById('btn-canvas')?.classList.toggle('primary', actualMode === 'canvas');
    document.getElementById('btn-auto')?.classList.toggle('primary', this.mode === 'auto');
    document.getElementById('disp-btn-term')?.classList.toggle('primary', actualMode === 'terminal');
    document.getElementById('disp-btn-canvas')?.classList.toggle('primary', actualMode === 'canvas');
    document.getElementById('disp-btn-auto')?.classList.toggle('primary', this.mode === 'auto');

    if (actualMode === 'terminal') {
      this.showTerminal();
    } else {
      this.showCanvas();
    }

    this.isGUIGuess = (actualMode === 'canvas');
    console.log(`[DisplayManager] Mode: ${this.mode} (resolved: ${actualMode})`);
  }

  showTerminal() {
    this.canvas.style.display = 'none';
    this.terminalEl.style.display = 'block';
    if (!this.terminal) this.initTerminal();
    setTimeout(() => this.fitAddon?.fit(), 50);
  }

  showCanvas() {
    this.terminalEl.style.display = 'none';
    this.canvas.style.display = 'block';
  }

  initTerminal() {
    if (!window.Terminal) {
      console.error('[DisplayManager] xterm.js not loaded');
      return;
    }
    this.terminal = new window.Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Courier New", monospace',
      theme: {
        background: '#0a0a0e',
        foreground: '#e0e6ed',
        cursor: '#39ff14',
        selectionBackground: 'rgba(57,255,20,0.2)',
        black: '#0a0a0e',
        red: '#ff4444',
        green: '#39ff14',
        yellow: '#ffb000',
        blue: '#00d4aa',
        magenta: '#ff44ff',
        cyan: '#00d4aa',
        white: '#e0e6ed',
      },
      scrollback: 10000,
      allowProposedApi: true,
    });

    this.fitAddon = new window.FitAddon.FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(this.terminalEl);
    this.fitAddon.fit();

    window.addEventListener('resize', () => {
      if (this.terminalEl.style.display !== 'none') {
        this.fitAddon?.fit();
      }
    });

    this.terminal.writeln('\x1b[1;32mWebBIOS Serial Console\x1b[0m');
    this.terminal.writeln('\x1b[90mWaiting for QEMU to start...\x1b[0m');
  }

  writeToTerminal(data) {
    if (!this.terminal) this.initTerminal();
    if (this.terminal) this.terminal.write(data);
  }

  writelnToTerminal(text) {
    if (!this.terminal) this.initTerminal();
    if (this.terminal) this.terminal.writeln(text);
  }

  clearTerminal() {
    if (this.terminal) this.terminal.clear();
  }

  drawCanvasFrame(imageData) {
    const ctx = this.canvas.getContext('2d');
    if (imageData instanceof ImageData) {
      ctx.putImageData(imageData, 0, 0);
    }
  }

  resizeCanvas(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  getCurrentMode() {
    return this.mode;
  }

  isGUIMode() {
    return this.isGUIGuess;
  }
}