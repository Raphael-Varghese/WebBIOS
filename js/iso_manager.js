/**
 * WebBIOS ISO Manager
 */

export class ISOManager {
  constructor() {
    this.files = [];
    this.bindDropzone();
  }

  bindDropzone() {
    const dz = document.getElementById('iso-dropzone');
    const input = document.getElementById('iso-input');

    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.iso'));
      files.forEach(f => this.add(f));
    });
    input.addEventListener('change', e => {
      Array.from(e.target.files).forEach(f => this.add(f));
    });
  }

  add(file) {
    this.files.push(file);
    this.render();
    this.updateStatus();
    if (window.App) window.App.showStatus(`Loaded ISO: ${file.name} (${this.formatBytes(file.size)})`, 'ok');
  }

  remove(index) {
    this.files.splice(index, 1);
    this.render();
    this.updateStatus();
  }

  get(index) {
    return this.files[index] || null;
  }

  getAll() {
    return [...this.files];
  }

  count() {
    return this.files.length;
  }

  formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  render() {
    const list = document.getElementById('iso-list');
    list.innerHTML = '';
    this.files.forEach((file, idx) => {
      const item = document.createElement('div');
      item.className = 'iso-item';
      item.innerHTML = `
        <div class="iso-icon">ISO</div>
        <div class="iso-details">
          <div class="iso-name">${this.escapeHtml(file.name)}</div>
          <div class="iso-meta">${this.formatBytes(file.size)}</div>
        </div>
        <div class="iso-actions">
          <button onclick="App.vm.bootIso(${idx})" class="primary">Boot</button>
          <button onclick="App.iso.remove(${idx})" class="danger">Remove</button>
        </div>
      `;
      list.appendChild(item);
    });
  }

  updateStatus() {
    const status = document.getElementById('iso-status');
    if (this.files.length > 0) {
      status.textContent = `${this.files.length} Image(s) Loaded`;
      status.className = 'boot-status connected';
    } else {
      status.textContent = 'No Media';
      status.className = 'boot-status disconnected';
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}