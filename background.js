import { getGroups, addBookmarkToGroup, makeBookmark } from './lib/storage.js';

const ROOT_ID = 'tm-save-to-group';
const OPEN_MANAGER_ID = 'tm-open-manager';
const MENU_CONTEXTS = ['page', 'link'];

async function rebuildMenu() {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({ id: ROOT_ID, title: 'Guardar en Tab Manager', contexts: MENU_CONTEXTS });

  const groups = await getGroups();

  if (groups.length === 0) {
    chrome.contextMenus.create({
      id: OPEN_MANAGER_ID,
      parentId: ROOT_ID,
      title: 'Crea un grupo primero (abrir gestor)',
      contexts: MENU_CONTEXTS,
    });
    return;
  }

  groups.forEach((g) => {
    chrome.contextMenus.create({
      id: `tm-group-${g.id}`,
      parentId: ROOT_ID,
      title: g.name,
      contexts: MENU_CONTEXTS,
    });
  });

  chrome.contextMenus.create({ id: 'tm-separator', parentId: ROOT_ID, type: 'separator', contexts: MENU_CONTEXTS });
  chrome.contextMenus.create({ id: OPEN_MANAGER_ID, parentId: ROOT_ID, title: 'Abrir gestor', contexts: MENU_CONTEXTS });
}

chrome.runtime.onInstalled.addListener(rebuildMenu);
chrome.runtime.onStartup.addListener(rebuildMenu);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.groups) rebuildMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === OPEN_MANAGER_ID) {
    chrome.tabs.create({});
    return;
  }

  const match = /^tm-group-(.+)$/.exec(info.menuItemId);
  if (!match) return;

  const groupId = match[1];
  const url = info.linkUrl || info.pageUrl;
  const title = info.linkUrl ? info.linkUrl : tab?.title || url;
  const bookmark = makeBookmark({ title, url, favIconUrl: info.linkUrl ? '' : tab?.favIconUrl || '' });

  await addBookmarkToGroup(groupId, bookmark);

  chrome.action.setBadgeText({ text: '✓', tabId: tab?.id });
  chrome.action.setBadgeBackgroundColor({ color: '#4c7cf0' });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '', tabId: tab?.id });
  }, 1200);
});
