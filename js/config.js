/**
 * WebBIOS Configuration Manager
 */

export class ConfigManager {
  constructor() {
    this.defaults = {
      ram: 1024,
      cpus: 2,
      diskSize: 4,
      fastBoot: true,
      uefi: false,
      bootMenu: true,
      virtio: true,
      acpi: true,
      network: false,
      hostNetwork: true,
      slirp: true,
      displayMode: 'auto',
      extraArgs: '',
    };
    this.settings = { ...this.defaults };
    this.load();
  }

  update(key, value) {
    if (key === 'ram') {
      this.settings.ram = parseInt(value);
      document.getElementById('ram-value').textContent = value + ' MB';
    } else if (key === 'cpu') {
      this.settings.cpus = parseInt(value);
      document.getElementById('cpu-value').textContent = value;
    } else if (key === 'disk') {
      this.settings.diskSize = parseInt(value);
      document.getElementById('disk-value').textContent = value + ' GB';
    }
  }

  get(key) {
    return this.settings[key];
  }

  getAll() {
    const isOn = id => document.getElementById(id)?.classList.contains('on') ?? false;
    return {
      ...this.settings,
      fastBoot: isOn('toggle-fastboot'),
      uefi: isOn('toggle-uefi'),
      bootMenu: isOn('toggle-bootmenu'),
      virtio: isOn('toggle-virtio'),
      acpi: isOn('toggle-acpi'),
      network: isOn('toggle-network'),
      hostNetwork: isOn('toggle-hostnet'),
      slirp: isOn('toggle-slirp'),
      extraArgs: document.getElementById('extra-args')?.value || '',
    };
  }

  save() {
    const data = this.getAll();
    localStorage.setItem('webbios-settings', JSON.stringify(data));
    if (window.App) window.App.showStatus('Settings saved to localStorage.', 'ok');
  }

  load() {
    try {
      const raw = localStorage.getItem('webbios-settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        this.settings = { ...this.defaults, ...parsed };
        this.applyToUI();
        if (window.App) window.App.showStatus('Settings loaded from localStorage.', 'info');
      }
    } catch (e) {
      console.warn('[ConfigManager] Failed to load settings:', e);
    }
  }

  defaults() {
    this.settings = { ...this.defaults };
    this.applyToUI();
    if (window.App) window.App.showStatus('Loaded optimized defaults.', 'ok');
  }

  clear() {
    localStorage.removeItem('webbios-settings');
    this.settings = { ...this.defaults };
    this.applyToUI();
    if (window.App) window.App.showStatus('All saved data cleared.', 'ok');
  }

  applyToUI() {
    const s = this.settings;
    document.getElementById('ram-slider').value = s.ram;
    document.getElementById('ram-value').textContent = s.ram + ' MB';
    document.getElementById('cpu-slider').value = s.cpus;
    document.getElementById('cpu-value').textContent = s.cpus;
    document.getElementById('disk-slider').value = s.diskSize;
    document.getElementById('disk-value').textContent = s.diskSize + ' GB';
    document.getElementById('extra-args').value = s.extraArgs || '';

    const setToggle = (id, on) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('on', on);
    };
    setToggle('toggle-fastboot', s.fastBoot);
    setToggle('toggle-uefi', s.uefi);
    setToggle('toggle-bootmenu', s.bootMenu);
    setToggle('toggle-virtio', s.virtio);
    setToggle('toggle-acpi', s.acpi);
    setToggle('toggle-network', s.network);
    setToggle('toggle-hostnet', s.hostNetwork);
    setToggle('toggle-slirp', s.slirp);
  }
}