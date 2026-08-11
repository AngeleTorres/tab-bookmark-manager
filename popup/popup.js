import { addGroup, makeGroup, makeBookmark } from '../lib/storage.js';

const saveBtn = document.getElementById('save-btn');
const openManagerBtn = document.getElementById('open-manager-btn');
const statusEl = document.getElementById('status');

function formatDefaultName() {
  const now = new Date();
  return `Sesión ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

saveBtn.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const bookmarks = tabs
    .filter((t) => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith(location.origin))
    .map((t) => makeBookmark({ title: t.title, url: t.url, favIconUrl: t.favIconUrl }));

  await addGroup(makeGroup(formatDefaultName(), bookmarks));
  statusEl.textContent = `Guardadas ${bookmarks.length} pestañas.`;
  setTimeout(() => window.close(), 900);
});

openManagerBtn.addEventListener('click', () => {
  chrome.tabs.create({});
  window.close();
});
