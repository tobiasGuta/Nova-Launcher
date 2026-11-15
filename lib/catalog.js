// Pure logic: usable by GNOME Shell and Node tests.
export const TABS = ['All','Development','Internet','Utilities','Graphics','Games','Other'];
export function categoryOf(categories = '') {
    const set = new Set(categories.split(';').filter(Boolean));
    if (set.has('Development')) return 'Development';
    if (set.has('Network') || set.has('WebBrowser') || set.has('Email')) return 'Internet';
    if (set.has('Utility') || set.has('System') || set.has('Settings')) return 'Utilities';
    if (set.has('Graphics') || set.has('Photography')) return 'Graphics';
    if (set.has('Game')) return 'Games';
    return 'Other';
}
export function buildCatalog(infos) {
    return infos.filter(info => info.should_show() && info.get_id() && info.get_name())
        .map(info => ({
            id: info.get_id(), name: info.get_name(),
            description: info.get_description() || '',
            category: categoryOf(info.get_categories() || ''), info,
        })).sort((a,b) => a.name.localeCompare(b.name));
}
export function searchCatalog(catalog, query, tab = 'All', limit = 72) {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const hits = catalog.filter(item =>
        (tab === 'All' || item.category === tab) &&
        words.every(word =>
            (item.name + ' ' + item.description).toLocaleLowerCase().includes(word)));
    if (words.length) {
        const prefix = words.join(' ');
        hits.sort((a,b) => Number(!a.name.toLocaleLowerCase().startsWith(prefix)) -
            Number(!b.name.toLocaleLowerCase().startsWith(prefix)) ||
            a.name.localeCompare(b.name));
    }
    return {total:hits.length, items:hits.slice(0, Math.max(1,limit))};
}
export function fitColumns(width, preferred) {
    return Math.max(1, Math.min(preferred, Math.floor((width - 44)/112)));
}
