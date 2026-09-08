# WebBIOS

A browser-based BIOS firmware interface that boots real x86/x86_64 operating systems using QEMU compiled to WebAssembly. Drop an ISO file, configure your VM, and boot actual OSes without leaving your browser.

---

## Features

- **Real OS Booting**: Not a simulation. Uses QEMU System x86_64 compiled to WASM via Emscripten.
- **Drag-and-Drop ISO Loading**: Drop any bootable x86/x86_64 ISO file into the browser.
- **Auto-Detect Display Mode**: Automatically switches between terminal (serial console) for text-mode OSes and canvas (VGA framebuffer) for GUI OSes.
- **Manual Display Override**: Force terminal, canvas, or auto mode at any time from the Boot tab or VM overlay.
- **Virtual Disk Creation**: Create raw disk images for OS installation.
- **Network Bridge**: Optional WebSocket proxy gives the guest OS access to the host machine's internet connection.
- **Full VM Configuration**: Adjust RAM, vCPUs, disk size, boot priority, UEFI mode, VirtIO, ACPI, and custom QEMU flags.
- **Persistent Settings**: Saves VM configuration to browser localStorage.
- **CRT BIOS Aesthetic**: Phosphor green theme with scanlines and monospace typography.

---

## System Requirements

### Host Machine
- **OS**: Windows 10/11 (WSL2 recommended), macOS, or Linux
- **RAM**: 8 GB minimum (guest VM uses 1 GB by default, configurable up to 4 GB)
- **CPU**: x86_64 processor with at least 2 cores (guest uses 2 vCPUs by default)
- **Browser**: Chrome 89+, Edge 89+, or Firefox 90+ (requires SharedArrayBuffer support)
- **Python**: 3.8 or newer (for the development server)

### Required Browser Features
- `SharedArrayBuffer` (required for QEMU pthreads)
- WebAssembly (Wasm)
- ES6 Modules

> **Important**: You cannot open `index.html` directly with `file://`. The browser will block SharedArrayBuffer. You must use the provided `server.py`.

---

## Quick Start

### 1. Get the Pre-Built Files

The QEMU-WASM build artifacts are provided separately. You should have the following files in your project root:

```
WebBIOS/
├─ index.html
├── server.py
├── js/
│   ├── app.js
│   ├── config.js
│   ├── iso-manager.js
│   ├── boot-manager.js
│   ├── display-manager.js
│   ├── network-manager.js
│   └── qemu-bridge.js
├── out.js                          <-- Provided build artifact
├── qemu-system-x86_64.wasm          <-- Provided build artifact
├── qemu-system-x86_64.worker.js   <-- Provided build artifact
├── qemu-system-x86_64.data        <-- Provided build artifact
└── load.js                          <-- Provided build artifact
```

If any of the build artifacts (`out.js`, `.wasm`, `.worker.js`, `.data`, `load.js`) are missing, request them from the project maintainer. You do not need to build QEMU yourself.

### 2. Install the WebSocket Dependency (Optional, for Network)

If you want guest OS internet access, install `websockets`:

```bash
pip install websockets
```

If you skip this, the HTTP server still works but the network proxy will be disabled.

### 3. Start the Server

Open a terminal in the project folder and run:

```bash
python3 server.py
```

Or with custom ports:

```bash
python3 server.py 8080 8081
```

- **HTTP Server**: `http://localhost:8080` (serves the WebBIOS UI)
- **WebSocket Proxy**: `ws://localhost:8081` (bridges guest network to host)

The server automatically sends the required `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers that enable `SharedArrayBuffer`.

### 4. Open WebBIOS in Your Browser

Navigate to:

```
http://localhost:8080/index.html
```

You will see the POST boot sequence. Press any key to skip it, or wait for it to finish.

---

## Usage Guide

### Loading an ISO

1. Click the **ISO Library** tab in the left sidebar.
2. Drag and drop a bootable `.iso` file onto the dropzone, or click to browse.
3. The ISO appears in the list with its filename and size.

**Recommended first ISO**: Alpine Linux Standard x86_64 (~180 MB). It boots fast and works reliably in terminal mode.

### Booting the VM

1. Go to the **Boot** tab.
2. Ensure **CD-ROM (ISO Image)** is at the top of the boot priority list. Use the Move Up/Down buttons if needed.
3. Click **Boot Selected Device**.
4. The VM display overlay opens automatically.

### Display Modes

WebBIOS has three display modes:

| Mode | Best For | How It Works |
|------|----------|--------------|
| **Terminal** | Linux text-mode installers, Alpine, Debian Netinst, FreeDOS | Captures QEMU serial output and renders it in xterm.js |
| **Canvas** | GUI OSes with VGA output (Windows, Ubuntu Desktop, etc.) | Attempts to capture QEMU's VGA framebuffer and render to HTML5 Canvas |
| **Auto** | Any ISO | Guesses based on filename patterns (e.g., "alpine" -> terminal, "windows" -> canvas) |

You can switch modes at any time:
- From the **Boot** tab before starting the VM.
- From the VM overlay toolbar while the VM is running.

> **Note**: Canvas/VGA mode depends on how QEMU was compiled. If the canvas stays black, switch to Terminal mode. Most lightweight Linux ISOs work best in Terminal mode.

### Creating a Virtual Disk

1. In the **VM Settings** tab, adjust the **Virtual Disk Size** slider (1-20 GB).
2. Go to the **Boot** tab and click **Create Disk**.
3. The disk is created in QEMU's virtual filesystem. You can then install an OS from ISO to the virtual disk.

> **Note**: Due to browser MEMFS limitations, disks larger than 1 GB are initially capped at 512 MB. For full-size disks, an IDBFS backend would be needed (future improvement).

### Network Configuration

1. Go to the **Network** tab.
2. Flip the **Enable Network** toggle.
3. The UI attempts to connect to `ws://localhost:8081`.
4. If connected, the guest OS can reach the internet through the host machine.

Network modes:
- **Host Network Bridge**: Guest traffic is tunneled through the host's connection (default).
- **SLIRP NAT**: QEMU's built-in user-mode NAT. Guest gets IP `10.0.2.15`.

If the proxy connection fails, make sure:
- `server.py` is running.
- `pip install websockets` was executed.
- No other application is using port 8081.

### VM Settings

In the **VM Settings** tab you can configure:

- **Guest RAM**: 256 MB to 4096 MB (default 1024 MB)
- **vCPUs**: 1 to 4 cores (default 2)
- **Virtual Disk Size**: 1 to 20 GB (default 4 GB)
- **VirtIO Devices**: Paravirtualized disk and network (recommended)
- **ACPI**: Power management tables exposed to guest
- **UEFI Boot**: Use OVMF firmware instead of legacy PC-BIOS
- **Additional QEMU Arguments**: Append raw QEMU flags (e.g., `-cpu qemu64,+vmx`)

### Saving Configuration

1. Go to the **Save & Exit** tab.
2. Click **Save Settings** to persist configuration to browser localStorage.
3. Use **Reload Saved Settings** to restore them on your next visit.
4. Use **Load Optimized Defaults** to reset to safe defaults (1024 MB RAM, 2 vCPUs, 4 GB disk).

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Esc` | Stop the running VM |
| `F10` | Save settings |
| `Enter` | Select boot device / confirm action |
| `Up/Down` | Navigate boot priority list |

While the VM is running, keyboard input is captured and sent to the guest OS as PC scancodes. Mouse input is captured when you click the canvas (pointer lock).

---

## OS Compatibility

| OS | Display Mode | Performance | Notes |
|----|-------------|-------------|-------|
| Alpine Linux | Terminal | Fast | Recommended first test |
| Debian Netinst | Terminal | Good | Text-mode installer works well |
| Tiny Core Linux | Terminal / Canvas | Very Fast | Lightweight, good for testing |
| FreeDOS | Terminal | Fast | Boots instantly |
| Ubuntu Server | Terminal | Good | Text installer |
| Windows 98/XP | Canvas | Slow | Heavy GUI, expect low FPS |
| Windows 10/11 | Canvas | Very Slow | Not recommended on 8 GB RAM hosts |

---

## Troubleshooting

### "SharedArrayBuffer is not available"

**Cause**: You opened the file directly (`file://`) or your server does not send COOP/COEP headers.

**Fix**: Use `python3 server.py` and access via `http://localhost:8080`. Do not double-click `index.html`.

### "QEMU module not loaded" or `out.js` errors

**Cause**: The build artifacts are missing or in the wrong directory.

**Fix**: Ensure `out.js`, `.wasm`, `.worker.js`, `.data`, and `load.js` are in the same folder as `index.html`. Check the browser console (F12) for 404 errors.

### ISO boots but display is blank

**Cause**: The display mode does not match the ISO output type.

**Fix**: Stop the VM (`Esc`), go to the Boot tab, switch to the other display mode (Terminal or Canvas), and boot again.

### "Failed to create virtual disk"

**Cause**: QEMU module not initialized, or insufficient browser memory.

**Fix**: Wait for the QEMU module to fully load (footer says "QEMU-WASM Ready"). Try a smaller disk size (1-2 GB).

### Network proxy connection failed

**Cause**: `websockets` Python package not installed, or port 8081 is in use.

**Fix**:
```bash
pip install websockets
python3 server.py 8080 8082  # Use a different WebSocket port
```

### Slow performance

**Cause**: Large ISO, high RAM allocation, or GUI OS with canvas rendering.

**Fix**:
- Use text-mode ISOs (Alpine, Debian Netinst).
- Reduce guest RAM to 512-1024 MB.
- Reduce vCPUs to 1.
- Close other browser tabs.

### Boot fails with "no bootable device"

**Cause**: ISO not written to QEMU filesystem correctly, or boot priority is wrong.

**Fix**: Re-drop the ISO. Ensure CD-ROM is first in boot priority. Check browser console for FS write errors.

---

## Architecture

```
User
  |
  v
+--------------------------------------------------+
|  Browser                                          |
|  +----------------------------------------------+ |
|  | WebBIOS UI (index.html + CSS)                | |
|  |  - Boot sequence, tabs, settings             | |
|  +----------------------------------------------+ |
|  +----------------------------------------------+ |
|  | App Orchestrator (app.js)                    | |
|  |  - Coordinates all modules                   | |
|  +----------------------------------------------+ |
|  +----------------------------------------------+ |
|  | QEMU Bridge (qemu-bridge.js)                 | |
|  |  - FS: writes ISO/disk to MEMFS              | |
|  |  - argv builder: constructs QEMU flags       | |
|  |  - callMain(): starts the VM                 | |
|  |  - Serial bridge -> xterm.js                 | |
|  |  - VGA bridge -> Canvas polling              | |
|  |  - Input bridge: keyboard/mouse scancodes  | |
|  |  - Network bridge -> WebSocket proxy         | |
|  +----------------------------------------------+ |
|  +----------------------------------------------+ |
|  | QEMU-WASM (out.js + .wasm + .data)           | |
|  |  - x86_64 system emulator                    | |
|  |  - TCG JIT compiler                          | |
|  |  - PC-BIOS / VGA BIOS firmware               | |
|  +----------------------------------------------+ |
+--------------------------------------------------+
  |
  |  HTTP + WebSocket
  v
+--------------------------------------------------+
|  server.py (Python)                               |
|  - HTTP server with COOP/COEP headers             |
|  - WebSocket proxy on port 8081                 |
+--------------------------------------------------+
```

---

## File Structure

```
WebBIOS/
├── index.html                  # BIOS UI shell
├── server.py                   # Development server with COOP/COEP + WS proxy
├── js/
│   ├── app.js                  # Main orchestrator
│   ├── config.js               # Settings, localStorage, defaults
│   ├── iso-manager.js          # Drag-drop, ISO file handling
│   ├── boot-manager.js         # Boot priority, device selection
│   ├── display-manager.js      # xterm.js + Canvas mode switching
│   ├── network-manager.js      # WebSocket proxy client
│   └── qemu-bridge.js          # QEMU FS, argv, callMain, bridges
├── out.js                      # Emscripten QEMU loader (provided)
├── qemu-system-x86_64.wasm     # QEMU WASM binary (provided)
├── qemu-system-x86_64.worker.js# Pthreads Web Worker (provided)
├── qemu-system-x86_64.data     # Packaged firmware blobs (provided)
└── load.js                     # Emscripten file packager loader (provided)
```

---

## Technical Notes

### Why Two Servers?

QEMU-WASM requires `SharedArrayBuffer` for pthreads. Browsers only allow this with:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

`server.py` sends these headers automatically. The WebSocket proxy runs on a separate port because you cannot upgrade an HTTP connection to WebSocket on the same handler without extra routing logic.

### Display Auto-Detection

The auto-detect logic uses filename pattern matching:

- **Terminal**: alpine, debian-netinst, ubuntu-server, tinycore, freedos, vyos, openwrt
- **Canvas**: windows, ubuntu-desktop, fedora-workstation, manjaro, mint, arch (live)

This is a heuristic, not a deep ISO analysis. You can always override manually.

### Memory Limits

The browser sets hard limits on WASM memory. On an 8 GB host:
- Guest RAM should not exceed 4096 MB.
- QEMU's own WASM heap is initialized at 256 MB and grows as needed.
- Virtual disks larger than 1 GB are capped at 512 MB initial allocation due to MEMFS constraints.

### Security

- ISO files are never uploaded to any remote server. They stay in browser memory and QEMU's virtual filesystem.
- The WebSocket proxy only runs locally (`localhost`). It does not expose your network externally.
- `localStorage` only stores VM settings (RAM, CPU, toggles), never ISO contents.

---

## Roadmap

- [x] Modular JavaScript architecture
- [x] QEMU-WASM module loading with real `callMain()`
- [x] ISO-to-filesystem bridge
- [x] Virtual disk creation
- [x] Serial output to xterm.js
- [x] VGA framebuffer polling to Canvas
- [x] Keyboard scancode injection
- [x] Mouse pointer lock and input
- [x] WebSocket network proxy
- [x] Auto-detect display mode
- [x] localStorage persistence
- [ ] IDBFS backend for large virtual disks
- [ ] Snapshot / save VM state
- [ ] Audio bridge (PC speaker, SoundBlaster -> Web Audio API)
- [ ] PWA support (Service Worker + manifest)
- [ ] ISO 9660 parser to browse contents before boot

---

## License

This project is provided as-is for educational and development purposes. QEMU is licensed under the GPL v2. The WebBIOS UI and bridge code are separate works that interface with QEMU.

---

## Support

If you encounter issues:
1. Check the browser console (F12 -> Console) for red error messages.
2. Verify all build artifacts are present in the project root.
3. Confirm you are accessing via `http://localhost:8080`, not `file://`.
4. Ensure `server.py` is running and `websockets` is installed if using network features.
