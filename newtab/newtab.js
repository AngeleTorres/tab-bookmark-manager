import {
  getGroups,
  addGroup,
  renameGroup,
  deleteGroup,
  toggleGroupCollapsed,
  setAllGroupsCollapsed,
  reorderGroups,
  addBookmarkToGroup,
  addBookmarkAt,
  removeBookmark,
  updateBookmark,
  moveBookmark,
  makeGroup,
  makeBookmark,
  faviconUrl,
  getUiPrefs,
  setUiPrefs,
  exportData,
  importData,
  restoreGroup,
} from '../lib/storage.js';

const FALLBACK_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="4" fill="#2a2e35"/><circle cx="8" cy="8" r="2.5" fill="#6b6e75"/></svg>'
  );

function setFaviconWithFallback(img, pageUrl) {
  img.src = faviconUrl(pageUrl);
  img.addEventListener(
    'error',
    () => {
      img.src = FALLBACK_ICON;
    },
    { once: true }
  );
}

const groupNavListEl = document.getElementById('group-nav-list');
const searchInputEl = document.getElementById('search-input');
const groupsContainerEl = document.getElementById('groups-container');
const emptyStateEl = document.getElementById('empty-state');
const noResultsEl = document.getElementById('no-results-state');
const newGroupNavBtn = document.getElementById('new-group-btn');
const expandAllBtn = document.getElementById('expand-all-btn');
const collapseAllBtn = document.getElementById('collapse-all-btn');
const addGroupBtn = document.getElementById('add-group-btn');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFileInput = document.getElementById('import-file-input');

const tabsPanelEl = document.getElementById('tabs-panel');
const toggleTabsPanelBtn = document.getElementById('toggle-tabs-panel-btn');
const openTabsListEl = document.getElementById('open-tabs-list');
const refreshTabsBtn = document.getElementById('refresh-tabs-btn');
const tabsPanelStatusEl = document.getElementById('tabs-panel-status');

const modalOverlay = document.getElementById('modal-overlay');
const modalLabel = document.getElementById('modal-label');
const modalInput = document.getElementById('modal-input');
const modalLabel2 = document.getElementById('modal-label-2');
const modalInput2 = document.getElementById('modal-input-2');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');

const groupPickerEl = document.getElementById('group-picker');

const toastEl = document.getElementById('toast');
const toastMessageEl = document.getElementById('toast-message');
const toastUndoBtn = document.getElementById('toast-undo');

let groups = [];
let draggedGroupId = null;
let selectedMatchIndex = 0;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatch(text, filter) {
  const escaped = escapeHtml(text || '');
  if (!filter) return escaped;
  const re = new RegExp(`(${escapeRegExp(filter)})`, 'ig');
  return escaped.replace(re, '<mark>$1</mark>');
}

function normalize(str) {
  return (str || '').toLowerCase();
}

function bookmarkMatches(bm, filter) {
  return normalize(bm.title).includes(filter) || normalize(bm.url).includes(filter);
}

function groupMatchesFilter(group, filter) {
  if (!filter) return true;
  return normalize(group.name).includes(filter) || group.bookmarks.some((bm) => bookmarkMatches(bm, filter));
}

function getFilteredMatches(filter) {
  const results = [];
  if (!filter) return results;
  for (const group of groups) {
    if (!groupMatchesFilter(group, filter)) continue;
    const nameMatches = normalize(group.name).includes(filter);
    const visible = nameMatches ? group.bookmarks : group.bookmarks.filter((bm) => bookmarkMatches(bm, filter));
    visible.forEach((bm) => results.push(bm));
  }
  return results;
}

function updateSelectionHighlight() {
  document.querySelectorAll('.tab-card.selected').forEach((el) => el.classList.remove('selected'));

  const filter = normalize(searchInputEl.value.trim());
  if (!filter) return;
  const matches = getFilteredMatches(filter);
  if (matches.length === 0) return;

  selectedMatchIndex = ((selectedMatchIndex % matches.length) + matches.length) % matches.length;
  const selected = matches[selectedMatchIndex];
  const card = groupsContainerEl.querySelector(`.tab-card[data-bookmark-id="${selected.id}"]`);
  if (card) {
    card.classList.add('selected');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function flashStatus(msg) {
  tabsPanelStatusEl.textContent = msg;
  setTimeout(() => {
    if (tabsPanelStatusEl.textContent === msg) tabsPanelStatusEl.textContent = '';
  }, 1500);
}

/* ---------- Modal ---------- */

function openModal(opts, onConfirm) {
  modalLabel.textContent = opts.primaryLabel || 'Nombre';
  modalInput.value = opts.primaryValue || '';

  if (opts.secondaryLabel) {
    modalLabel2.hidden = false;
    modalInput2.hidden = false;
    modalLabel2.textContent = opts.secondaryLabel;
    modalInput2.value = opts.secondaryValue || '';
  } else {
    modalLabel2.hidden = true;
    modalInput2.hidden = true;
  }

  modalOverlay.hidden = false;
  requestAnimationFrame(() => modalOverlay.classList.add('open'));
  modalInput.focus();
  modalInput.select();

  const cleanup = () => {
    modalOverlay.classList.remove('open');
    setTimeout(() => {
      modalOverlay.hidden = true;
    }, 150);
    modalConfirm.removeEventListener('click', onOk);
    modalCancel.removeEventListener('click', onCancel);
  };
  const onOk = () => {
    const primary = modalInput.value.trim();
    const secondary = modalInput2.value.trim();
    if (!primary) return;
    if (opts.secondaryLabel && !secondary) return;
    cleanup();
    onConfirm(primary, secondary);
  };
  const onCancel = () => cleanup();

  modalConfirm.addEventListener('click', onOk);
  modalCancel.addEventListener('click', onCancel);
}

function confirmDialog(message) {
  return new Promise((resolve) => {
    modalLabel.textContent = message;
    modalInput.hidden = true;
    modalLabel2.hidden = true;
    modalInput2.hidden = true;
    modalConfirm.textContent = 'Eliminar';
    modalConfirm.classList.add('danger');

    modalOverlay.hidden = false;
    requestAnimationFrame(() => modalOverlay.classList.add('open'));

    const cleanup = (result) => {
      modalOverlay.classList.remove('open');
      setTimeout(() => {
        modalOverlay.hidden = true;
        modalInput.hidden = false;
        modalConfirm.textContent = 'Guardar';
        modalConfirm.classList.remove('danger');
      }, 150);
      modalConfirm.removeEventListener('click', onOk);
      modalCancel.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);

    modalConfirm.addEventListener('click', onOk);
    modalCancel.addEventListener('click', onCancel);
  });
}

/* ---------- Undo toast ---------- */

let toastTimeout = null;

function showUndoToast(message, onUndo) {
  clearTimeout(toastTimeout);
  toastMessageEl.textContent = message;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('show'));

  toastUndoBtn.onclick = () => {
    clearTimeout(toastTimeout);
    hideToast();
    onUndo();
  };

  toastTimeout = setTimeout(hideToast, 5000);
}

function hideToast() {
  toastEl.classList.remove('show');
  setTimeout(() => {
    toastEl.hidden = true;
  }, 200);
}

/* ---------- Group picker (choose target group for an open tab) ---------- */

function showGroupPicker(x, y, onSelect) {
  if (groups.length === 0) return;
  groupPickerEl.innerHTML = '';
  groups.forEach((g) => {
    const btn = document.createElement('button');
    btn.textContent = g.name;
    btn.addEventListener('click', () => {
      hideGroupPicker();
      onSelect(g.id);
    });
    groupPickerEl.appendChild(btn);
  });
  groupPickerEl.style.left = `${x}px`;
  groupPickerEl.style.top = `${y}px`;
  groupPickerEl.hidden = false;
}

function hideGroupPicker() {
  groupPickerEl.hidden = true;
}

document.addEventListener('click', (e) => {
  if (!groupPickerEl.hidden && !groupPickerEl.contains(e.target)) hideGroupPicker();
});

/* ---------- Group reordering (shared by sidebar nav + main view) ---------- */

async function reorderGroupsTo(targetGroupId) {
  if (!draggedGroupId || draggedGroupId === targetGroupId) return;
  const ids = groups.map((g) => g.id);
  const from = ids.indexOf(draggedGroupId);
  const to = ids.indexOf(targetGroupId);
  if (from === -1 || to === -1) return;
  ids.splice(from, 1);
  ids.splice(to, 0, draggedGroupId);
  groups = await reorderGroups(ids);
  draggedGroupId = null;
  renderSidebar();
  renderMain();
}

/* ---------- Data refresh ---------- */

async function refresh() {
  groups = await getGroups();
  renderSidebar();
  renderMain();
}

/* ---------- Sidebar nav ---------- */

function renderSidebar() {
  const filter = normalize(searchInputEl.value.trim());
  groupNavListEl.innerHTML = '';

  groups
    .filter((g) => groupMatchesFilter(g, filter))
    .forEach((g) => {
      const li = document.createElement('li');
      li.draggable = true;
      li.innerHTML = `<span class="name">${highlightMatch(g.name, filter)}</span><span class="count">${g.bookmarks.length}</span>`;

      li.querySelector('.name').addEventListener('click', () => {
        const target = document.getElementById(`group-${g.id}`);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.add('flash');
        setTimeout(() => target.classList.remove('flash'), 700);
      });

      li.addEventListener('dragstart', (e) => {
        draggedGroupId = g.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', g.id);
      });
      li.addEventListener('dragend', () => {
        draggedGroupId = null;
      });
      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
      li.addEventListener('drop', async (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');
        await reorderGroupsTo(g.id);
      });

      groupNavListEl.appendChild(li);
    });
}

/* ---------- Main panel ---------- */

function renderMain() {
  const filter = normalize(searchInputEl.value.trim());
  groupsContainerEl.innerHTML = '';
  emptyStateEl.hidden = groups.length > 0;

  const visibleGroups = groups.filter((g) => groupMatchesFilter(g, filter));
  noResultsEl.hidden = !(filter && groups.length > 0 && visibleGroups.length === 0);

  visibleGroups.forEach((group) => {
    groupsContainerEl.appendChild(renderGroup(group, filter));
  });

  updateSelectionHighlight();
}

function animateCollapse(grid, collapse) {
  if (collapse) {
    const h = grid.scrollHeight;
    grid.style.maxHeight = `${h}px`;
    grid.style.opacity = '1';
    requestAnimationFrame(() => {
      grid.style.maxHeight = '0px';
      grid.style.opacity = '0';
    });
  } else {
    grid.style.maxHeight = '0px';
    grid.style.opacity = '0';
    requestAnimationFrame(() => {
      const h = grid.scrollHeight;
      grid.style.maxHeight = `${h}px`;
      grid.style.opacity = '1';
    });
    const handler = (e) => {
      if (e.propertyName === 'max-height') {
        grid.style.maxHeight = 'none';
        grid.removeEventListener('transitionend', handler);
      }
    };
    grid.addEventListener('transitionend', handler);
  }
}

function renderGroup(group, filter = '') {
  const nameMatches = filter && normalize(group.name).includes(filter);
  const visibleBookmarks =
    !filter || nameMatches ? group.bookmarks : group.bookmarks.filter((bm) => bookmarkMatches(bm, filter));
  const forceExpanded = !!filter;
  const isCollapsed = !forceExpanded && group.collapsed;

  const section = document.createElement('section');
  section.className = 'group';
  section.id = `group-${group.id}`;

  const header = document.createElement('div');
  header.className = 'group-header';
  header.draggable = true;
  header.innerHTML = `
    <span class="group-name">
      <span class="chevron ${isCollapsed ? 'collapsed' : ''}">▾</span>
      ${highlightMatch(group.name, filter)} · ${visibleBookmarks.length}
    </span>
    <div class="group-header-actions">
      <button data-action="open-all" title="Abrir todo">↗</button>
      <button data-action="add">+ Bookmark</button>
      <button data-action="rename">✎</button>
      <button data-action="delete">✕</button>
    </div>
  `;

  header.addEventListener('dragstart', (e) => {
    draggedGroupId = group.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', group.id);
  });
  header.addEventListener('dragend', () => {
    draggedGroupId = null;
  });
  section.addEventListener('dragover', (e) => {
    if (!draggedGroupId) return;
    e.preventDefault();
    section.classList.add('drag-over-group');
  });
  section.addEventListener('dragleave', () => section.classList.remove('drag-over-group'));
  section.addEventListener('drop', async (e) => {
    if (!draggedGroupId) return;
    e.preventDefault();
    section.classList.remove('drag-over-group');
    await reorderGroupsTo(group.id);
  });

  const grid = document.createElement('div');
  grid.className = 'group-grid';
  grid.style.maxHeight = isCollapsed ? '0px' : 'none';
  grid.style.opacity = isCollapsed ? '0' : '1';

  header.querySelector('.group-name').addEventListener('click', async () => {
    const chevron = header.querySelector('.chevron');
    const collapsing = !chevron.classList.contains('collapsed');
    chevron.classList.toggle('collapsed', collapsing);
    animateCollapse(grid, collapsing);
    groups = await toggleGroupCollapsed(group.id);
  });

  header.querySelector('[data-action="open-all"]').addEventListener('click', (e) => {
    e.stopPropagation();
    if (group.bookmarks.length === 0) return;
    chrome.windows.create({ url: group.bookmarks.map((bm) => bm.url) });
  });

  header.querySelector('[data-action="add"]').addEventListener('click', (e) => {
    e.stopPropagation();
    openModal(
      { primaryLabel: 'Título', primaryValue: '', secondaryLabel: 'URL', secondaryValue: 'https://' },
      async (title, url) => {
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        groups = await addBookmarkToGroup(group.id, makeBookmark({ title, url }));
        renderSidebar();
        renderMain();
      }
    );
  });

  header.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
    e.stopPropagation();
    openModal({ primaryLabel: 'Nombre del grupo', primaryValue: group.name }, async (name) => {
      groups = await renameGroup(group.id, name);
      renderSidebar();
      renderMain();
    });
  });

  header.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await confirmDialog(`¿Eliminar el grupo "${group.name}" y sus ${group.bookmarks.length} bookmarks?`);
    if (!ok) return;
    const originalIndex = groups.indexOf(group);
    groups = await deleteGroup(group.id);
    renderSidebar();
    renderMain();
    showUndoToast(`Grupo "${group.name}" eliminado`, async () => {
      groups = await restoreGroup(group, originalIndex);
      renderSidebar();
      renderMain();
    });
  });

  grid.addEventListener('dragover', (e) => {
    if (draggedGroupId) return;
    e.preventDefault();
    e.stopPropagation();
    grid.classList.add('drag-over');
  });
  grid.addEventListener('dragleave', () => grid.classList.remove('drag-over'));
  grid.addEventListener('drop', async (e) => {
    if (draggedGroupId) return;
    e.preventDefault();
    e.stopPropagation();
    grid.classList.remove('drag-over');
    await handleBookmarkDrop(e, group, null);
  });

  visibleBookmarks.forEach((bm) => {
    const realIndex = group.bookmarks.indexOf(bm);
    grid.appendChild(renderBookmarkCard(group, bm, realIndex, filter));
  });

  section.appendChild(header);
  section.appendChild(grid);
  return section;
}

async function handleBookmarkDrop(e, group, targetIndex) {
  const raw = e.dataTransfer.getData('application/json');
  if (!raw) return;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }
  if (data.type === 'bookmark') {
    if (data.groupId === group.id && targetIndex == null) return;
    groups = await moveBookmark(data.groupId, group.id, data.bookmarkId, targetIndex);
  } else if (data.type === 'open-tab') {
    const bookmark = makeBookmark({ title: data.title, url: data.url, favIconUrl: data.favIconUrl });
    groups = await addBookmarkAt(group.id, bookmark, targetIndex);
  }
  renderSidebar();
  renderMain();
}

function renderBookmarkCard(group, bm, index, filter = '') {
  const card = document.createElement('div');
  card.className = 'tab-card';
  card.draggable = true;
  card.dataset.bookmarkId = bm.id;
  card.innerHTML = `
    <button class="remove-btn" title="Quitar">✕</button>
    <button class="edit-btn" title="Editar">✎</button>
    <img class="favicon" />
    <div class="title">${highlightMatch(bm.title, filter)}</div>
    <div class="url">${highlightMatch(bm.url, filter)}</div>
  `;
  setFaviconWithFallback(card.querySelector('.favicon'), bm.url);

  card.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ type: 'bookmark', groupId: group.id, bookmarkId: bm.id })
    );
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  card.addEventListener('dragover', (e) => {
    if (draggedGroupId) return;
    e.preventDefault();
    e.stopPropagation();
    card.classList.add('drag-over-card');
  });
  card.addEventListener('dragleave', () => card.classList.remove('drag-over-card'));
  card.addEventListener('drop', async (e) => {
    if (draggedGroupId) return;
    e.preventDefault();
    e.stopPropagation();
    card.classList.remove('drag-over-card');
    await handleBookmarkDrop(e, group, index);
  });

  card.addEventListener('click', (e) => {
    if (e.target.closest('.remove-btn') || e.target.closest('.edit-btn')) return;
    chrome.tabs.create({ url: bm.url });
  });

  card.querySelector('.edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    openModal(
      { primaryLabel: 'Título', primaryValue: bm.title, secondaryLabel: 'URL', secondaryValue: bm.url },
      async (title, url) => {
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        groups = await updateBookmark(group.id, bm.id, { title, url });
        renderSidebar();
        renderMain();
      }
    );
  });

  card.querySelector('.remove-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const originalIndex = group.bookmarks.indexOf(bm);
    groups = await removeBookmark(group.id, bm.id);
    renderSidebar();
    renderMain();
    showUndoToast(`"${bm.title}" eliminado`, async () => {
      groups = await addBookmarkAt(group.id, bm, originalIndex);
      renderSidebar();
      renderMain();
    });
  });

  return card;
}

/* ---------- Open tabs panel ---------- */

async function renderOpenTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const filtered = tabs.filter((t) => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith(location.origin));

  openTabsListEl.innerHTML = '';
  filtered.forEach((tab) => {
    const li = document.createElement('li');
    li.draggable = true;
    li.innerHTML = `<img /><span>${escapeHtml(tab.title || tab.url)}</span>`;
    setFaviconWithFallback(li.querySelector('img'), tab.url);

    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData(
        'application/json',
        JSON.stringify({ type: 'open-tab', title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl || '' })
      );
    });

    li.addEventListener('click', (e) => {
      e.stopPropagation();
      if (groups.length === 0) {
        flashStatus('Crea un grupo primero');
        return;
      }
      const addTo = async (groupId) => {
        groups = await addBookmarkToGroup(
          groupId,
          makeBookmark({ title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl })
        );
        renderSidebar();
        renderMain();
        flashStatus('Añadido');
      };
      if (groups.length === 1) {
        addTo(groups[0].id);
      } else {
        showGroupPicker(e.clientX, e.clientY, addTo);
      }
    });

    openTabsListEl.appendChild(li);
  });
}

/* ---------- Header actions ---------- */

function createGroupFlow() {
  openModal({ primaryLabel: 'Nombre del grupo', primaryValue: '' }, async (name) => {
    groups = await addGroup(makeGroup(name));
    renderSidebar();
    renderMain();
    const target = document.getElementById(`group-${groups[groups.length - 1].id}`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

newGroupNavBtn.addEventListener('click', createGroupFlow);
addGroupBtn.addEventListener('click', createGroupFlow);

expandAllBtn.addEventListener('click', async () => {
  groups = await setAllGroupsCollapsed(false);
  renderMain();
});

collapseAllBtn.addEventListener('click', async () => {
  groups = await setAllGroupsCollapsed(true);
  renderMain();
});

exportBtn.addEventListener('click', async () => {
  const json = await exportData();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `tab-manager-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => importFileInput.click());

importFileInput.addEventListener('change', async () => {
  const file = importFileInput.files[0];
  importFileInput.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    groups = await importData(text);
    renderSidebar();
    renderMain();
    flashStatus('Datos importados');
  } catch (err) {
    alert(`No se pudo importar el archivo: ${err.message}`);
  }
});

searchInputEl.addEventListener('input', () => {
  selectedMatchIndex = 0;
  renderSidebar();
  renderMain();
});

searchInputEl.addEventListener('keydown', (e) => {
  const filter = normalize(searchInputEl.value.trim());
  if (!filter) return;

  if (e.key === 'ArrowRight') {
    e.preventDefault();
    selectedMatchIndex += 1;
    updateSelectionHighlight();
    return;
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    selectedMatchIndex -= 1;
    updateSelectionHighlight();
    return;
  }
  if (e.key === 'Enter') {
    const matches = getFilteredMatches(filter);
    if (matches.length === 0) return;
    const index = ((selectedMatchIndex % matches.length) + matches.length) % matches.length;
    chrome.tabs.create({ url: matches[index].url });
    searchInputEl.value = '';
    selectedMatchIndex = 0;
    renderSidebar();
    renderMain();
  }
});

refreshTabsBtn.addEventListener('click', renderOpenTabs);

toggleTabsPanelBtn.addEventListener('click', async () => {
  const collapsed = tabsPanelEl.classList.toggle('collapsed');
  await setUiPrefs({ tabsPanelCollapsed: collapsed });
});

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) {
    modalOverlay.classList.remove('open');
    setTimeout(() => {
      modalOverlay.hidden = true;
    }, 150);
  }
});

chrome.tabs.onCreated.addListener(renderOpenTabs);
chrome.tabs.onRemoved.addListener(renderOpenTabs);
chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.title) renderOpenTabs();
});

(async () => {
  const prefs = await getUiPrefs();
  if (prefs.tabsPanelCollapsed) tabsPanelEl.classList.add('collapsed');
})();

refresh();
renderOpenTabs();
