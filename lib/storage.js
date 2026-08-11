const GROUPS_KEY = 'groups';
const BOARDS_KEY = 'boards';
const LEGACY_COLLECTIONS_KEY = 'collections';

async function migrateLegacy() {
  const data = await chrome.storage.local.get([GROUPS_KEY, BOARDS_KEY, LEGACY_COLLECTIONS_KEY]);
  if (data[GROUPS_KEY]) return;

  if (data[BOARDS_KEY]) {
    const groups = data[BOARDS_KEY].flatMap((board) =>
      board.groups.map((g) => ({
        id: g.id,
        name: g.name,
        collapsed: !!g.collapsed,
        bookmarks: g.bookmarks || [],
      }))
    );
    await chrome.storage.local.set({ [GROUPS_KEY]: groups });
    await chrome.storage.local.remove(BOARDS_KEY);
    return;
  }

  if (data[LEGACY_COLLECTIONS_KEY]) {
    const groups = data[LEGACY_COLLECTIONS_KEY].map((c) => ({
      id: c.id,
      name: c.name,
      collapsed: false,
      bookmarks: (c.tabs || []).map((t) => ({
        id: crypto.randomUUID(),
        title: t.title,
        url: t.url,
        favIconUrl: t.favIconUrl || '',
      })),
    }));
    await chrome.storage.local.set({ [GROUPS_KEY]: groups });
    await chrome.storage.local.remove(LEGACY_COLLECTIONS_KEY);
  }
}

export async function getGroups() {
  await migrateLegacy();
  const data = await chrome.storage.local.get(GROUPS_KEY);
  return data[GROUPS_KEY] || [];
}

export async function saveGroups(groups) {
  await chrome.storage.local.set({ [GROUPS_KEY]: groups });
}

export function makeBookmark({ title, url, favIconUrl }) {
  return { id: crypto.randomUUID(), title: title || url, url, favIconUrl: favIconUrl || '' };
}

export function makeGroup(name, bookmarks = []) {
  return { id: crypto.randomUUID(), name, collapsed: false, bookmarks };
}

export async function addGroup(group) {
  const groups = await getGroups();
  groups.push(group);
  await saveGroups(groups);
  return groups;
}

export async function renameGroup(groupId, name) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) return groups;
  group.name = name;
  await saveGroups(groups);
  return groups;
}

export async function deleteGroup(groupId) {
  const groups = await getGroups();
  const next = groups.filter((g) => g.id !== groupId);
  await saveGroups(next);
  return next;
}

export async function restoreGroup(group, index) {
  const groups = await getGroups();
  const i = Math.max(0, Math.min(index, groups.length));
  groups.splice(i, 0, group);
  await saveGroups(groups);
  return groups;
}

export async function toggleGroupCollapsed(groupId) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) return groups;
  group.collapsed = !group.collapsed;
  await saveGroups(groups);
  return groups;
}

export async function setAllGroupsCollapsed(collapsed) {
  const groups = await getGroups();
  groups.forEach((g) => {
    g.collapsed = collapsed;
  });
  await saveGroups(groups);
  return groups;
}

export async function reorderGroups(orderedIds) {
  const groups = await getGroups();
  const map = new Map(groups.map((g) => [g.id, g]));
  const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean);
  groups.forEach((g) => {
    if (!orderedIds.includes(g.id)) reordered.push(g);
  });
  await saveGroups(reordered);
  return reordered;
}

export async function addBookmarkToGroup(groupId, bookmark) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) return groups;
  group.bookmarks.push(bookmark);
  await saveGroups(groups);
  return groups;
}

export async function addBookmarkAt(groupId, bookmark, index) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) return groups;
  const i = index == null ? group.bookmarks.length : Math.max(0, Math.min(index, group.bookmarks.length));
  group.bookmarks.splice(i, 0, bookmark);
  await saveGroups(groups);
  return groups;
}

export async function removeBookmark(groupId, bookmarkId) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) return groups;
  group.bookmarks = group.bookmarks.filter((bm) => bm.id !== bookmarkId);
  await saveGroups(groups);
  return groups;
}

export async function updateBookmark(groupId, bookmarkId, patch) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) return groups;
  const bookmark = group.bookmarks.find((bm) => bm.id === bookmarkId);
  if (!bookmark) return groups;
  Object.assign(bookmark, patch);
  await saveGroups(groups);
  return groups;
}

export async function moveBookmark(fromGroupId, toGroupId, bookmarkId, targetIndex = null) {
  const groups = await getGroups();
  const fromGroup = groups.find((g) => g.id === fromGroupId);
  const toGroup = groups.find((g) => g.id === toGroupId);
  if (!fromGroup || !toGroup) return groups;
  const idx = fromGroup.bookmarks.findIndex((bm) => bm.id === bookmarkId);
  if (idx === -1) return groups;

  if (fromGroupId === toGroupId) {
    if (targetIndex == null || targetIndex === idx) return groups;
    const [bm] = fromGroup.bookmarks.splice(idx, 1);
    const insertAt = idx < targetIndex ? targetIndex - 1 : targetIndex;
    fromGroup.bookmarks.splice(Math.max(0, insertAt), 0, bm);
    await saveGroups(groups);
    return groups;
  }

  const [bookmark] = fromGroup.bookmarks.splice(idx, 1);
  const insertAt = targetIndex == null ? toGroup.bookmarks.length : Math.max(0, Math.min(targetIndex, toGroup.bookmarks.length));
  toGroup.bookmarks.splice(insertAt, 0, bookmark);
  await saveGroups(groups);
  return groups;
}

/* ---------- Export / import ---------- */

export async function exportData() {
  const groups = await getGroups();
  return JSON.stringify({ version: 1, exportedAt: Date.now(), groups }, null, 2);
}

export async function importData(json) {
  const parsed = JSON.parse(json);
  let incoming;

  if (Array.isArray(parsed)) {
    incoming = parsed;
  } else if (Array.isArray(parsed.groups)) {
    // Our own export format: { groups: [{ name, bookmarks: [{ title, url, favIconUrl }] }] }
    incoming = parsed.groups;
  } else if (Array.isArray(parsed.lists)) {
    // Toby export format: { lists: [{ title, cards: [{ title, url, customTitle }] }] }
    incoming = parsed.lists.map((list) => ({
      name: list.title,
      bookmarks: (list.cards || []).map((card) => ({
        title: card.customTitle || card.title,
        url: card.url,
      })),
    }));
  } else {
    throw new Error('Formato de archivo inválido');
  }

  const cloned = incoming.map((g) => ({
    id: crypto.randomUUID(),
    name: g.name || 'Importado',
    collapsed: false,
    bookmarks: (g.bookmarks || [])
      .filter((bm) => bm && bm.url)
      .map((bm) => ({
        id: crypto.randomUUID(),
        title: bm.title || bm.url,
        url: bm.url,
        favIconUrl: bm.favIconUrl || '',
      })),
  }));

  const groups = await getGroups();
  const next = groups.concat(cloned);
  await saveGroups(next);
  return next;
}

/* ---------- Favicons ---------- */

// Uses Chrome's local favicon cache instead of fetching the page's own
// favicon URL directly — avoids CORS/auth failures on intranet or
// login-gated sites (e.g. corporate portals) that block cross-origin <img> requests.
export function faviconUrl(pageUrl, size = 32) {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.toString();
}

/* ---------- UI preferences ---------- */

const PREFS_KEY = 'uiPrefs';

export async function getUiPrefs() {
  const data = await chrome.storage.local.get(PREFS_KEY);
  return data[PREFS_KEY] || {};
}

export async function setUiPrefs(patch) {
  const prefs = await getUiPrefs();
  const next = { ...prefs, ...patch };
  await chrome.storage.local.set({ [PREFS_KEY]: next });
  return next;
}
