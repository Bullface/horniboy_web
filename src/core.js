import { INITIAL_GROUPS, INITIAL_SHOPS, EXTRA_GROUPS, EXTRA_SHOPS } from './presets.js';

export const STORAGE_KEY = 'horniboy:state:v2';
export const SEARCH_PLACEHOLDER = '{search_keyword}';
export const MAX_HISTORY = 12;

const copy = data => JSON.parse(JSON.stringify(data));
const limitText = (v, size) => typeof v === 'string' ? v.trim().slice(0, size) : '';

export function makeId(prefix = 'id') {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function defaultState() {
  return {
    version: 2,
    groups: copy(INITIAL_GROUPS),
    shops: copy(INITIAL_SHOPS),
    history: [],
    saved: [],
    theme: 'dark',
    lastQuery: '',
  };
}

export function validTemplate(template) {
  if (typeof template !== 'string' || template.length > 2048 || !template.includes(SEARCH_PLACEHOLDER)) return false;
  if (template.match(/\{search_keyword\}/g)?.length !== 1) return false;
  try {
    // A search term must never control the destination hostname or port.
    if (template.split('://')[1]?.split(/[/?#]/)[0].includes(SEARCH_PLACEHOLDER)) return false;
    const url = new URL(template.replace(SEARCH_PLACEHOLDER, 'test'));
    return ['https:', 'http:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

export function searchUrl(template, query) {
  if (!validTemplate(template)) throw new Error('Ungültige Suchvorlage');
  const term = limitText(query, 300);
  if (!term) throw new Error('Bitte einen Suchbegriff eingeben');
  return new URL(template.replace(SEARCH_PLACEHOLDER, encodeURIComponent(term))).toString();
}

export function siteDomain(template) {
  try { return new URL(template.replace(SEARCH_PLACEHOLDER, 'test')).hostname.replace(/^www\./i, ''); }
  catch { return 'Unbekannter Shop'; }
}

export function effectiveShops(state) {
  const activeGroups = new Set(state.groups.filter(g => g.enabled).map(g => g.id));
  return state.shops.filter(s => s.enabled && (!s.groupId || activeGroups.has(s.groupId)) && validTemplate(s.template));
}

export function addHistory(history, query) {
  const term = limitText(query, 300);
  if (!term) return history;
  return [term, ...history.filter(x => x.toLowerCase() !== term.toLowerCase())].slice(0, MAX_HISTORY);
}

export function detectTemplate(rawUrl) {
  let url;
  try { url = new URL(limitText(rawUrl, 2048)); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;

  const keys = ['q', 'query', 'search', 'keyword', 'keywords', 'k', 's', 'text', 'term', 'searchquery', 'search_query', 'suche', 'suchbegriff', 'searchterm', 'fs', '_nkw', 'w'];
  const entries = [...url.searchParams.entries()];
  for (const key of keys) {
    const entry = entries.find(([k, value]) => k.toLowerCase() === key && value.trim());
    if (entry) {
      url.searchParams.set(entry[0], 'HORNiBOY_SEARCH_MARKER');
      const template = url.toString().replace('HORNiBOY_SEARCH_MARKER', SEARCH_PLACEHOLDER);
      if (validTemplate(template)) return { template, detectedBy: `Suchparameter „${entry[0]}“` };
    }
  }

  const segments = url.pathname.split('/');
  const prefixes = new Set(['s', 'search', 'suche', 'find', 'results', 'result', 'query', 'buscar', 'recherche']);
  for (let i = 1; i < segments.length; i++) {
    const previous = segments[i - 1].toLowerCase();
    const current = segments[i];
    if (prefixes.has(previous) && current && !/^\d+$/.test(current)) {
      segments[i] = 'HORNiBOY_SEARCH_MARKER';
      url.pathname = segments.join('/');
      const template = url.toString().replace('HORNiBOY_SEARCH_MARKER', SEARCH_PLACEHOLDER);
      if (validTemplate(template)) return { template, detectedBy: 'Suchbegriff im URL-Pfad' };
    }
  }
  return null;
}

function saneGroups(groups) {
  if (!Array.isArray(groups)) return copy(INITIAL_GROUPS);
  const result = [];
  const ids = new Set();
  for (const item of groups.slice(0, 100)) {
    if (!item || typeof item !== 'object') continue;
    const name = limitText(item.name || item.label, 60);
    if (!name) continue;
    const id = limitText(item.id, 100) || makeId('group');
    if (ids.has(id)) continue;
    ids.add(id);
    result.push({ id, name, enabled: item.enabled !== false && item.active !== false });
  }
  return result;
}

function saneShops(shops, groups) {
  if (!Array.isArray(shops)) return copy(INITIAL_SHOPS);
  const result = [], ids = new Set();
  const allowedGroups = new Set(groups.map(g => g.id));
  for (const item of shops.slice(0, 300)) {
    if (typeof item === 'string') {
      if (!validTemplate(item)) continue;
      result.push({ id: makeId('shop'), name: siteDomain(item), template: item, groupId: null, enabled: true });
      continue;
    }
    if (!item || typeof item !== 'object' || !validTemplate(item.template)) continue;
    const id = limitText(item.id, 100) || makeId('shop');
    if (ids.has(id)) continue;
    ids.add(id);
    result.push({
      id,
      name: limitText(item.name || item.label, 80) || siteDomain(item.template),
      template: item.template,
      groupId: allowedGroups.has(item.groupId) ? item.groupId : null,
      enabled: item.enabled !== false,
    });
  }
  return result;
}

export function normalizeState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Keine gültigen Konfigurationsdaten');
  const base = defaultState();
  const groups = saneGroups(input.groups);
  const shops = saneShops(input.shops ?? input.urls ?? input.legacyUrls, groups);
  const rawHistory = Array.isArray(input.history) ? input.history : Array.isArray(input.searchHistory) ? input.searchHistory : [];
  const history = [];
  for (const h of rawHistory) {
    if (typeof h === 'string') {
      const term = limitText(h, 300);
      if (term && !history.some(x => x.toLowerCase() === term.toLowerCase())) history.push(term);
    }
    if (history.length >= MAX_HISTORY) break;
  }
  const saved = [], savedIds = new Set();
  for (const s of (Array.isArray(input.saved) ? input.saved : Array.isArray(input.savedSearches) ? input.savedSearches : []).slice(0, 100)) {
    if (!s || typeof s !== 'object') continue;
    const name = limitText(s.name, 80), query = limitText(s.query, 300);
    if (!name || !query) continue;
    const id = limitText(s.id, 100) || makeId('saved');
    if (savedIds.has(id)) continue;
    savedIds.add(id); saved.push({ id, name, query });
  }
  return {
    ...base, groups, shops, history, saved,
    theme: input.theme === 'light' ? 'light' : 'dark',
    lastQuery: limitText(input.lastQuery, 300),
  };
}

export function parseImportText(text) {
  if (typeof text !== 'string' || text.length > 1_000_000) throw new Error('Datei ist leer oder zu groß');
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (typeof value.template === 'string') return normalizeState({ groups: [], shops: [value] });
      if ('shops' in value || 'urls' in value || 'groups' in value || 'legacyUrls' in value) return normalizeState(value);
    }
    throw new Error('JSON enthält keine Horniboy-Konfiguration');
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) throw new Error('Keine Suchvorlagen in der Datei');
  // Legacy urls.txt: plain URLs or one JSON shop object per line.
  const urls = lines.map(line => {
    if (line.startsWith('{')) {
      try { return JSON.parse(line); } catch { return null; }
    }
    return line;
  }).filter(Boolean);
  const result = normalizeState({ groups: [], urls });
  if (!result.shops.length) throw new Error('Keine gültigen Suchvorlagen gefunden');
  return result;
}

export function addExtraPresets(state) {
  const next = copy(state);
  const groupIds = new Set(next.groups.map(g => g.id));
  for (const group of [...INITIAL_GROUPS, ...EXTRA_GROUPS]) {
    if (!groupIds.has(group.id)) next.groups.push(copy(group));
  }
  const existingTemplates = new Set(next.shops.map(s => s.template));
  let added = 0;
  for (const shop of EXTRA_SHOPS) {
    if (existingTemplates.has(shop.template)) continue;
    next.shops.push(copy(shop));
    existingTemplates.add(shop.template);
    added++;
  }
  return { state: next, added };
}