// Public catalog filters use names returned by FANZA, never invented categories.
export const catalogFilterLabels = Object.freeze({actress:'出演者', genre:'ジャンル', maker:'メーカー'});
export function readCatalogFilters(query = {}) {
  const filters = {};
  for (const key of Object.keys(catalogFilterLabels)) {
    const value = query[key];
    if (value == null || value === '') continue;
    if (typeof value !== 'string' || value.length > 80 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Invalid catalog filter');
    const name = value.normalize('NFKC').trim();
    if (name) filters[key] = name;
  }
  return filters;
}
export function catalogFilterPath(path, filters = {}) {
  const query = new URLSearchParams();
  for (const key of Object.keys(catalogFilterLabels)) if (filters[key]) query.set(key, filters[key]);
  return path + (query.size ? '?' + query : '');
}
export function filterCatalogItems(items, filters = {}) {
  const array = value => Array.isArray(value) ? value : value ? [value] : [];
  return items.filter(item => Object.entries(filters).every(([key, name]) =>
    array(item?.iteminfo?.[key]).some(entry => typeof entry?.name === 'string' && entry.name.normalize('NFKC').trim() === name)
  ));
}
