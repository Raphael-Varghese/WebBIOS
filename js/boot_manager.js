/**
 * WebBIOS Boot Manager
 */

export class BootManager {
  constructor() {
    this.selectedIndex = 0;
    this.bindList();
  }

  bindList() {
    const list = document.getElementById('boot-list');
    const items = list.querySelectorAll('.boot-item');
    items.forEach((item, idx) => {
      item.addEventListener('click', () => {
        this.selectedIndex = idx;
        this.refresh();
      });
    });
    this.refresh();
  }

  refresh() {
    const list = document.getElementById('boot-list');
    const items = list.querySelectorAll('.boot-item');
    items.forEach((item, idx) => {
      item.classList.toggle('selected', idx === this.selectedIndex);
      const numEl = item.querySelector('.boot-num');
      if (numEl) numEl.textContent = idx + 1;
    });
  }

  moveUp() {
    this.moveItem(-1);
  }

  moveDown() {
    this.moveItem(1);
  }

  moveItem(dir) {
    const list = document.getElementById('boot-list');
    const items = Array.from(list.querySelectorAll('.boot-item'));
    const newIndex = this.selectedIndex + dir;
    if (newIndex < 0 || newIndex >= items.length) return;

    if (dir === -1) {
      list.insertBefore(items[this.selectedIndex], items[newIndex]);
    } else {
      list.insertBefore(items[newIndex], items[this.selectedIndex]);
    }
    this.selectedIndex = newIndex;
    this.refresh();
  }

  getSelectedDevice() {
    const list = document.getElementById('boot-list');
    const items = list.querySelectorAll('.boot-item');
    const item = items[this.selectedIndex];
    return item ? item.dataset.device : null;
  }

  getBootOrder() {
    const list = document.getElementById('boot-list');
    const items = list.querySelectorAll('.boot-item');
    return Array.from(items).map(item => ({
      device: item.dataset.device,
      name: item.querySelector('.boot-name')?.textContent?.trim() || '',
    }));
  }
}