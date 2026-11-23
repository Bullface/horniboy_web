// Original five search providers, taken from the repository's initial commit.
// Templates are user-editable; external shops can change their URLs at any time.
export const INITIAL_GROUPS = [
  { id: 'g-de', name: 'Baumärkte DE', enabled: true },
  { id: 'g-at', name: 'Baumärkte AT', enabled: true },
];

export const INITIAL_SHOPS = [
  { id: 'hornbach-de', name: 'Hornbach DE', groupId: 'g-de', enabled: true, template: 'https://www.hornbach.de/s/{search_keyword}?f.dsall=im+Markt+vorrätig&isInitialRequest=false' },
  { id: 'bauhaus-de', name: 'Bauhaus DE', groupId: 'g-de', enabled: true, template: 'https://www.bauhaus.info/search?availability=561&page=1&q={search_keyword}' },
  { id: 'sonderpreis-de', name: 'Sonderpreis Baumarkt', groupId: 'g-de', enabled: true, template: 'https://www.sonderpreis-baumarkt.de/search?q={search_keyword}&search-button=&lang=de_DE' },
  { id: 'obi-at', name: 'OBI AT', groupId: 'g-at', enabled: true, template: 'https://www.obi.at/search/{search_keyword}?_availability=store' },
  { id: 'obi-de', name: 'OBI DE', groupId: 'g-de', enabled: true, template: 'https://www.obi.de/search/{search_keyword}?_availability=store' },
];

// Optional providers from later stages of the old app. NOT loaded by default:
// the initial commit remains the baseline and this collection is opt-in.
export const EXTRA_GROUPS = [
  { id: 'g-3d', name: '3D-Druck', enabled: true },
  { id: 'g-market', name: 'Marktplätze', enabled: true },
  { id: 'g-electronics', name: 'Elektronik', enabled: true },
  { id: 'g-tools', name: 'Werkzeug', enabled: true },
];

export const EXTRA_SHOPS = [
  { id: 'bauhaus-at', name: 'Bauhaus AT', groupId: 'g-at', template: 'https://www.bauhaus.at/search?q={search_keyword}' },
  { id: 'lagerhaus', name: 'Lagerhaus', groupId: 'g-at', template: 'https://www.lagerhaus.at/marktplatz/suche?q={search_keyword}' },
  { id: 'toom', name: 'toom', groupId: 'g-de', template: 'https://toom.de/suche?q={search_keyword}' },
  { id: 'hellweg', name: 'Hellweg', groupId: 'g-de', template: 'https://www.hellweg.de/search?s={search_keyword}' },
  { id: 'hagebau', name: 'hagebau', groupId: 'g-de', template: 'https://www.hagebau.de/search/?q={search_keyword}' },
  { id: '3djake', name: '3DJake', groupId: 'g-3d', template: 'https://www.3djake.de/search?q={search_keyword}' },
  { id: 'filamentwelt', name: 'Filamentwelt', groupId: 'g-3d', template: 'https://www.filamentwelt.de/search?s={search_keyword}' },
  { id: 'prusa', name: 'Prusa', groupId: 'g-3d', template: 'https://www.prusa3d.com/search/?q={search_keyword}' },
  { id: 'anycubic', name: 'Anycubic', groupId: 'g-3d', template: 'https://store.anycubic.com/search?q={search_keyword}' },
  { id: 'printables', name: 'Printables', groupId: 'g-3d', template: 'https://www.printables.com/search?q={search_keyword}' },
  { id: 'thingiverse', name: 'Thingiverse', groupId: 'g-3d', template: 'https://www.thingiverse.com/search?q={search_keyword}&type=things' },
  { id: 'makerworld', name: 'MakerWorld', groupId: 'g-3d', template: 'https://makerworld.com/en/search?q={search_keyword}' },
  { id: 'cults3d', name: 'Cults3D', groupId: 'g-3d', template: 'https://cults3d.com/de/suche?q={search_keyword}' },
  { id: 'myminifactory', name: 'MyMiniFactory', groupId: 'g-3d', template: 'https://www.myminifactory.com/search/?q={search_keyword}' },
  { id: 'amazon-de', name: 'Amazon DE', groupId: 'g-market', template: 'https://www.amazon.de/s?k={search_keyword}' },
  { id: 'ebay-de', name: 'eBay DE', groupId: 'g-market', template: 'https://www.ebay.de/sch/i.html?_nkw={search_keyword}' },
  { id: 'willhaben', name: 'willhaben', groupId: 'g-market', template: 'https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz?keyword={search_keyword}' },
  { id: 'geizhals', name: 'Geizhals', groupId: 'g-market', template: 'https://geizhals.de/?fs={search_keyword}' },
  { id: 'idealo', name: 'idealo', groupId: 'g-market', template: 'https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q={search_keyword}' },
  { id: 'conrad', name: 'Conrad', groupId: 'g-electronics', template: 'https://www.conrad.de/de/Search.html?search={search_keyword}' },
  { id: 'reichelt', name: 'Reichelt', groupId: 'g-electronics', template: 'https://www.reichelt.de/index.html?ACTION=446&s={search_keyword}' },
  { id: 'contorion', name: 'Contorion', groupId: 'g-tools', template: 'https://www.contorion.de/search?q={search_keyword}' },
].map(shop => ({ ...shop, enabled: true }));