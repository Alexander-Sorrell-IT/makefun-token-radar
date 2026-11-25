// The address, in one place: #/board?q=usd&category=CDP&conf=high, #/p/<slug>, #/live, #/method.
// Every control writes the address and the router reads it back, so a view is always a link a reader can
// keep, and a screenshot script can open a filtered view by its URL rather than by clicking.

const SECTIONS = new Set(['board', 'watchlist', 'live', 'method']);

/** The current address as one object: a section, a protocol, and the board's filters. */
export function parse() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);

  if (parts[0] === 'p' && parts[1]) {
    return { section: 'board', slug: decodeURIComponent(parts[1]), filters: readFilters(params), detail: true };
  }
  const section = parts[0] && SECTIONS.has(parts[0]) ? parts[0] : 'board';
  return { section, slug: null, filters: readFilters(params), detail: false };
}

/** The board's filters, with the defaults a bare address carries. */
export function readFilters(params) {
  return {
    q: params.get('q') || '',
    category: params.get('category') || 'all',
    conf: params.get('conf') || 'all',
    sort: params.get('sort') || 'implied',
    dir: params.get('dir') === 'asc' ? 1 : -1,
  };
}

/** The address for a section and its filters, written without a history entry. */
export function write(section, filters, slug = null) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.category !== 'all') params.set('category', filters.category);
  if (filters.conf !== 'all') params.set('conf', filters.conf);
  if (filters.sort !== 'implied') params.set('sort', filters.sort);
  if (filters.dir === 1) params.set('dir', 'asc');
  const query = params.toString();
  const path = slug ? `p/${encodeURIComponent(slug)}` : section;
  window.history.replaceState(null, '', `#/${path}${query ? `?${query}` : ''}`);
}
