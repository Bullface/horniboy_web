import {
  STORAGE_KEY, defaultState, normalizeState, parseImportText, makeId,
  searchUrl, siteDomain, validTemplate, detectTemplate, effectiveShops,
  addHistory, addExtraPresets,
} from './core.js';

const $ = id => document.getElementById(id);
const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};
const btn = (label, className, callback) => {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', callback);
  return node;
};

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return normalizeState(JSON.parse(stored));
    // Migration only works if the old application shared the same origin.
    // Files from the Electron desktop application can be imported manually.
    const groups = localStorage.getItem('hb_groups');
    const urls = localStorage.getItem('hb_urls');
    if (groups || urls) {
      return normalizeState({
        groups: groups ? JSON.parse(groups) : undefined,
        urls: urls ? JSON.parse(urls) : undefined,
        searchHistory: JSON.parse(localStorage.getItem('searchHistory') || '[]'),
        savedSearches: JSON.parse(localStorage.getItem('hb_saved') || '[]'),
        theme: localStorage.getItem('hb_theme'),
      });
    }
  } catch (error) {
    console.warn('Konfiguration konnte nicht geladen werden:', error);
  }
  return defaultState();
}

let state = loadState();
let editingShopId = null;
let editingGroupId = null;
let toastTimer = null;

function toast(message) {
  const t = $('toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (error) { console.error(error); toast('Speichern im Browser ist fehlgeschlagen. Bitte Browserspeicher prüfen.'); }
}
function commit() { persist(); renderAll(); }

function groupName(groupId) { return state.groups.find(g => g.id === groupId)?.name ?? 'Ohne Gruppe'; }

function renderTheme() {
  document.body.dataset.theme = state.theme;
  document.documentElement.style.colorScheme = state.theme;
  $('theme-btn').textContent = state.theme === 'dark' ? '☼' : '☾';
  $('theme-btn').setAttribute('aria-label', state.theme === 'dark' ? 'Helles Design einschalten' : 'Dunkles Design einschalten');
}

function renderGroups() {
  const list = $('group-filters');
  list.replaceChildren();
  for (const group of state.groups) {
    const count = state.shops.filter(shop => shop.groupId === group.id && shop.enabled).length;
    const button = el('button', 'group-filter' + (group.enabled ? ' is-active' : ''));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(group.enabled));
    button.title = `${group.name} ${group.enabled ? 'deaktivieren' : 'aktivieren'}`;
    button.append(el('span', 'group-bullet'), el('span', 'group-filter-name', group.name), el('span', 'group-filter-count', String(count)));
    button.addEventListener('click', () => { group.enabled = !group.enabled; commit(); });
    list.append(button);
  }
  if (!state.groups.length) list.append(el('p', 'muted-hint', 'Keine Gruppen vorhanden.'));
  const active = effectiveShops(state).length;
  $('active-count').textContent = `${active} ${active === 1 ? 'Shop' : 'Shops'} ausgewählt`;
}

function createSearchChip(label, search, remove, ariaLabel) {
  const container = el('span', 'search-chip');
  container.append(btn(label, '', () => runSearch(search)));
  if (remove) {
    const deleteButton = btn('×', 'chip-delete', remove);
    deleteButton.setAttribute('aria-label', ariaLabel);
    container.append(deleteButton);
  }
  return container;
}

function renderSaved() {
  const list = $('saved-list');
  list.replaceChildren();
  if (!state.saved.length) { list.append(el('span', 'muted-hint', 'Noch keine gespeicherten Suchen.')); return; }
  for (const saved of state.saved) {
    list.append(createSearchChip(saved.name, saved.query, () => {
      state.saved = state.saved.filter(s => s.id !== saved.id);
      commit();
    }, `Gespeicherte Suche ${saved.name} löschen`));
  }
}

function renderHistory() {
  const list = $('history-list');
  list.replaceChildren();
  if (!state.history.length) { list.append(el('span', 'muted-hint', 'Deine letzten Suchbegriffe erscheinen hier.')); return; }
  for (const term of state.history) {
    list.append(createSearchChip(term, term, null, ''));
  }
}

function renderResults() {
  const list = $('shop-results');
  const active = effectiveShops(state);
  const query = state.lastQuery;
  const haveSearch = Boolean(query);
  const count = haveSearch ? active.length : 0;
  $('results-count').textContent = String(count);
  $('open-all-btn').disabled = !(haveSearch && count);
  $('results-subtitle').textContent = haveSearch ? `Suchlinks für „${query}“ · ${count} ${count === 1 ? 'Shop' : 'Shops'}` : 'Gib oben einen Suchbegriff ein, um zu starten.';
  $('empty-state').hidden = haveSearch && count > 0;
  if (!haveSearch) {
    $('empty-state').querySelector('h3').textContent = 'Alles bereit für deine Suche.';
    $('empty-state').querySelector('p').textContent = 'Wähle deine Shop-Gruppen aus und suche nach einem Produkt. Die passenden Links erscheinen hier.';
  } else if (!count) {
    $('empty-state').querySelector('h3').textContent = 'Keine Shops ausgewählt.';
    $('empty-state').querySelector('p').textContent = 'Aktiviere eine Gruppe oder füge einen Shop in den Einstellungen hinzu.';
  }
  list.replaceChildren();
  if (!haveSearch) { $('search-status').textContent = 'Bereit – Suchergebnisse werden als direkte Shoplinks erzeugt, nicht eingebettet.'; $('search-status').classList.remove('has-error'); return; }

  let validCount = 0;
  let invalidCount = 0;
  for (const shop of active) {
    let url;
    try { url = searchUrl(shop.template, query); }
    catch (error) {
      invalidCount++;
      window.horniboyDiagnostics?.record('error', `Invalid search URL for ${shop.name}: ${error.message}`);
      continue;
    }
    validCount++;
    const card = el('article', 'shop-card');
    const top = el('div', 'card-top');
    const avatar = el('div', 'shop-avatar', shop.name.slice(0, 2));
    avatar.setAttribute('aria-hidden', 'true');
    const info = el('div', 'shop-main');
    info.append(el('h3', '', shop.name), el('div', 'shop-domain', siteDomain(shop.template)));
    top.append(avatar, info);
    const group = el('div', 'shop-category', groupName(shop.groupId).toUpperCase());
    const preview = el('div', 'shop-link-preview', url);
    preview.title = url;
    const actions = el('div', 'card-actions');
    const open = el('a', 'card-open', 'Suchergebnisse öffnen  ↗');
    open.href = url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.setAttribute('aria-label', `${shop.name}: Suchergebnisse für ${query} in neuem Tab öffnen`);
    const copy = btn('⧉', 'card-copy', async () => {
      try { await navigator.clipboard.writeText(url); toast(`Link für ${shop.name} kopiert.`); }
      catch { toast('Kopieren war nicht möglich. Bitte Link manuell öffnen.'); }
    });
    copy.title = 'Link kopieren';
    copy.setAttribute('aria-label', `Suchlink für ${shop.name} kopieren`);
    actions.append(open, copy);
    card.append(top, group, preview, actions);
    list.append(card);
  }
  $('results-count').textContent = String(validCount);
  $('open-all-btn').disabled = validCount === 0;
  const status = $('search-status');
  status.textContent = invalidCount ? `${validCount} Suchlinks bereit · ${invalidCount} Vorlage(n) fehlerhaft. Öffne „Diagnose & Fehlerbericht“ für Details.` : `${validCount} Suchlinks bereit. Die Shopseiten öffnen sich beim jeweiligen Anbieter in einem neuen Tab.`;
  status.classList.toggle('has-error', invalidCount > 0);
}

function renderSettings() {
  const groupList = $('settings-groups');
  groupList.replaceChildren();
  for (const group of state.groups) {
    const row = el('div', 'setting-row');
    const toggle = el('input', 'setting-toggle');
    toggle.type = 'checkbox'; toggle.checked = group.enabled;
    toggle.setAttribute('aria-label', `${group.name} aktivieren`);
    toggle.addEventListener('change', () => { group.enabled = toggle.checked; commit(); });
    const main = el('div', 'setting-row-main');
    main.append(el('strong', '', group.name), el('span', '', `${state.shops.filter(s => s.groupId === group.id).length} Shops`));
    row.append(toggle, main, btn('Umbenennen', 'setting-row-btn', () => editGroup(group.id)));
    row.append(btn('Löschen', 'setting-row-btn danger', () => {
      if (!confirm(`Gruppe „${group.name}“ löschen? Zugeordnete Shops bleiben erhalten, aber ohne Gruppe.`)) return;
      state.groups = state.groups.filter(g => g.id !== group.id);
      state.shops = state.shops.map(s => s.groupId === group.id ? { ...s, groupId: null } : s);
      commit();
    }));
    groupList.append(row);
  }
  if (!state.groups.length) groupList.append(el('p', 'muted-hint', 'Keine Gruppen angelegt.'));

  const shopList = $('settings-shops');
  shopList.replaceChildren();
  for (const shop of state.shops) {
    const row = el('div', 'setting-row');
    const toggle = el('input', 'setting-toggle');
    toggle.type = 'checkbox'; toggle.checked = shop.enabled;
    toggle.setAttribute('aria-label', `${shop.name} aktivieren`);
    toggle.addEventListener('change', () => { shop.enabled = toggle.checked; commit(); });
    const main = el('div', 'setting-row-main');
    main.append(el('strong', '', shop.name), el('span', '', `${groupName(shop.groupId)} · ${siteDomain(shop.template)}`));
    row.append(toggle, main, btn('Bearbeiten', 'setting-row-btn', () => editShop(shop.id)));
    row.append(btn('Löschen', 'setting-row-btn danger', () => {
      if (!confirm(`Shop „${shop.name}“ wirklich löschen?`)) return;
      state.shops = state.shops.filter(s => s.id !== shop.id);
      commit();
    }));
    shopList.append(row);
  }
  if (!state.shops.length) shopList.append(el('p', 'muted-hint', 'Keine Shops vorhanden.'));
}

function renderAll() { renderTheme(); renderGroups(); renderHistory(); renderSaved(); renderResults(); if ($('settings-dialog').open) renderSettings(); }

function runSearch(rawQuery) {
  const query = String(rawQuery ?? '').trim().slice(0, 300);
  if (!query) { $('search-input').focus(); toast('Bitte einen Suchbegriff eingeben.'); return; }
  $('search-input').value = query;
  state.lastQuery = query;
  state.history = addHistory(state.history, query);
  try {
    const address = new URL(window.location.href);
    address.searchParams.set('q', query);
    history.replaceState(null, '', address);
  } catch (error) { console.warn('URL konnte nicht aktualisiert werden:', error); }
  commit();
  $('results-heading').scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}

function openSettings() { renderSettings(); $('settings-dialog').showModal(); }

function editGroup(id = null) {
  editingGroupId = id;
  $('group-form').hidden = false;
  $('group-name').value = state.groups.find(g => g.id === id)?.name || '';
  $('group-name').focus();
}

function closeGroupForm() { editingGroupId = null; $('group-name').value = ''; $('group-form').hidden = true; }

function editShop(id = null) {
  editingShopId = id;
  const shop = state.shops.find(s => s.id === id);
  $('shop-dialog-title').textContent = shop ? 'Shop bearbeiten' : 'Shop hinzufügen';
  $('shop-name').value = shop?.name ?? '';
  $('shop-template').value = shop?.template ?? '';
  $('shop-real-url').value = '';
  $('shop-enabled').checked = shop?.enabled ?? true;
  $('shop-error').hidden = true;
  $('detect-feedback').textContent = 'Kopiere einen Link zu einer Suche beim Anbieter hier hinein.';
  $('detect-feedback').classList.remove('good');
  const groupSelect = $('shop-group');
  groupSelect.replaceChildren();
  const empty = el('option', '', 'Ohne Gruppe'); empty.value = ''; groupSelect.append(empty);
  for (const group of state.groups) {
    const opt = el('option', '', group.name);
    opt.value = group.id; groupSelect.append(opt);
  }
  groupSelect.value = shop?.groupId ?? '';
  $('shop-dialog').showModal();
  $('shop-name').focus();
}

function exportSettings() {
  const content = JSON.stringify(state, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'horniboy-einstellungen.json';
  document.body.append(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast('Einstellungen als JSON exportiert.');
}

$('search-form').addEventListener('submit', event => { event.preventDefault(); runSearch($('search-input').value); });
$('settings-btn').addEventListener('click', openSettings);
$('mobile-settings-btn').addEventListener('click', openSettings);
$('theme-btn').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; commit(); });
$('enable-all-groups').addEventListener('click', () => { state.groups.forEach(g => { g.enabled = true; }); commit(); });
$('export-btn').addEventListener('click', exportSettings);
$('settings-export-btn').addEventListener('click', exportSettings);
$('import-btn').addEventListener('click', () => $('import-file').click());
$('settings-import-btn').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error('Die Datei ist zu groß (maximal 1 MB).');
    const next = parseImportText(await file.text());
    if (confirm(`Konfiguration importieren? Die aktuellen ${state.shops.length} Shops werden durch ${next.shops.length} Shops ersetzt. Du kannst sie vorher exportieren.`)) {
      state = next; closeGroupForm(); $('settings-dialog').close(); $('search-input').value = state.lastQuery; commit();
      toast(`${state.shops.length} Shops importiert.`);
    }
  } catch (error) { toast(`Import fehlgeschlagen: ${error.message}`); }
  finally { event.target.value = ''; }
});

$('save-search-btn').addEventListener('click', () => {
  const term = $('search-input').value.trim() || state.lastQuery;
  if (!term) { toast('Suche zuerst nach einem Begriff.'); $('search-input').focus(); return; }
  $('favorite-name').value = term;
  $('favorite-preview').textContent = `Suchbegriff: ${term}`;
  $('save-dialog').showModal(); $('favorite-name').focus();
});
$('favorite-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('favorite-name').value.trim();
  const query = $('search-input').value.trim() || state.lastQuery;
  if (!name || !query) return;
  if (state.saved.some(s => s.name.toLowerCase() === name.toLowerCase())) { toast('Diesen Favoritennamen gibt es bereits.'); return; }
  state.saved.unshift({ id: makeId('saved'), name: name.slice(0,80), query: query.slice(0,300) });
  state.saved = state.saved.slice(0,100);
  $('save-dialog').close(); commit(); toast('Suche gespeichert.');
});
$('clear-history-btn').addEventListener('click', () => {
  if (state.history.length && !confirm('Suchverlauf löschen?')) return;
  state.history = []; commit();
});
$('open-all-btn').addEventListener('click', () => {
  const links = effectiveShops(state).flatMap(shop => {
    try { return [searchUrl(shop.template, state.lastQuery)]; }
    catch (error) { window.horniboyDiagnostics?.record('error', `Cannot open ${shop.name}: ${error.message}`); return []; }
  });
  if (!links.length) return;
  if (links.length > 12 && !confirm(`${links.length} Tabs öffnen? Dein Browser kann mehrere Pop-ups blockieren.`)) return;
  // Open only in this direct click handler; never from a timer or effect.
  for (const url of links) window.open(url, '_blank', 'noopener,noreferrer');
  toast(`${links.length} Tabs angefordert. Falls nicht alle erscheinen, bitte Pop-ups zulassen oder einzelne Shops öffnen.`);
});
$('add-group-btn').addEventListener('click', () => editGroup());
$('cancel-group-btn').addEventListener('click', closeGroupForm);
$('group-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('group-name').value.trim();
  if (!name) return;
  if (state.groups.some(g => g.name.toLowerCase() === name.toLowerCase() && g.id !== editingGroupId)) { toast('Dieser Gruppenname existiert bereits.'); return; }
  const existing = state.groups.find(g => g.id === editingGroupId);
  if (existing) existing.name = name.slice(0,60);
  else state.groups.push({ id: makeId('group'), name: name.slice(0,60), enabled: true });
  closeGroupForm(); commit();
});
$('add-shop-btn').addEventListener('click', () => editShop());
$('shop-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('shop-name').value.trim();
  const template = $('shop-template').value.trim();
  if (!name || !validTemplate(template)) {
    $('shop-error').textContent = 'Bitte einen Namen und eine gültige http(s)-URL mit genau einem {search_keyword}-Platzhalter eingeben.';
    $('shop-error').hidden = false;
    return;
  }
  const selectedGroup = $('shop-group').value;
  const groupId = state.groups.some(g => g.id === selectedGroup) ? selectedGroup : null;
  const next = { name: name.slice(0,80), template, groupId, enabled: $('shop-enabled').checked };
  if (editingShopId) {
    const shop = state.shops.find(s => s.id === editingShopId);
    if (shop) Object.assign(shop, next);
  } else state.shops.push({ id: makeId('shop'), ...next });
  $('shop-dialog').close(); commit(); toast('Shop gespeichert.');
});
$('detect-btn').addEventListener('click', () => {
  const detected = detectTemplate($('shop-real-url').value);
  if (!detected) {
    $('detect-feedback').textContent = 'Keine eindeutige Suchstelle gefunden. Bitte die URL-Vorlage manuell eintragen.';
    $('detect-feedback').classList.remove('good'); return;
  }
  $('shop-template').value = detected.template;
  $('detect-feedback').textContent = `Erkannt: ${detected.detectedBy}. Vorlage übernommen.`;
  $('detect-feedback').classList.add('good');
});
$('add-presets-btn').addEventListener('click', () => {
  const result = addExtraPresets(state);
  state = result.state;
  commit(); toast(result.added ? `${result.added} neue Shops hinzugefügt.` : 'Alle zusätzlichen Vorlagen sind bereits vorhanden.');
});
$('reset-btn').addEventListener('click', () => {
  if (!confirm('Alle Shops, Gruppen, gespeicherten Suchen und den Verlauf zurücksetzen?')) return;
  state = defaultState();
  $('search-input').value = '';
  try { const url = new URL(location.href); url.searchParams.delete('q'); history.replaceState(null, '', url); } catch { /* ignore */ }
  closeGroupForm(); commit(); toast('Ursprüngliche fünf Shops wiederhergestellt.');
});
document.querySelectorAll('[data-close]').forEach(button => {
  button.addEventListener('click', () => $(button.dataset.close)?.close());
});
document.addEventListener('keydown', event => {
  const target = event.target;
  if ((event.key === '/' && !event.ctrlKey && !event.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
    event.preventDefault(); $('search-input').focus(); $('search-input').select();
  }
});

const urlQuery = new URLSearchParams(location.search).get('q')?.trim();
if (urlQuery) state.lastQuery = urlQuery.slice(0, 300);
$('search-input').value = state.lastQuery;
renderAll();

window.__horniboyReady = true;
window.horniboyDiagnostics?.record('info', 'Application initialized successfully');