// Pure logic shared by GNOME Shell and the Node tests.
export const TABS = [
    'All', 'Development', 'Internet', 'Utilities', 'Multimedia', 'Office',
    'Graphics', 'Games', 'Other',
];

export function categoryOf(categories = '') {
    const set = new Set(categories.split(';'));
    if (set.has('Development')) return 'Development';
    if (set.has('Network') || set.has('WebBrowser') || set.has('Email')) return 'Internet';
    if (set.has('AudioVideo') || set.has('Audio') || set.has('Video')) return 'Multimedia';
    if (set.has('Office')) return 'Office';
    if (set.has('Graphics') || set.has('Photography')) return 'Graphics';
    if (set.has('Game')) return 'Games';
    if (set.has('Utility') || set.has('System') || set.has('Settings')) return 'Utilities';
    return 'Other';
}

export function buildCatalog(infos, shouldShow = info => info.should_show()) {
    return infos.filter(info => shouldShow(info) && info.get_id() && info.get_name())
        .map(info => {
            const name = info.get_name();
            const description = info.get_description() || '';
            const keywords = info.get_keywords?.() ?? [];
            return {
                id: info.get_id(), name, info,
                category: categoryOf(info.get_categories() || ''),
                searchText: [name, description, ...keywords].join(' ').toLocaleLowerCase(),
            };
        }).sort((a, b) => a.name.localeCompare(b.name));
}

export function searchCatalog(catalog, query, tab = 'All') {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const hits = catalog.filter(item =>
        (tab === 'All' || item.category === tab) &&
        words.every(word => item.searchText.includes(word)));
    if (words.length) {
        const prefix = words.join(' ');
        hits.sort((a, b) => Number(!a.name.toLocaleLowerCase().startsWith(prefix)) -
            Number(!b.name.toLocaleLowerCase().startsWith(prefix)) ||
            a.name.localeCompare(b.name));
    }
    return hits;
}

export function favoriteApps(catalog, favoriteIds, limit) {
    const allowed = new Map(catalog.map(item => [item.id, item]));
    return [...new Set(favoriteIds)]
        .map(id => allowed.get(id))
        .filter(Boolean)
        .slice(0, limit);
}

export function fitColumns(width, preferred, iconSize = 56) {
    return Math.max(1, Math.min(preferred, Math.floor((width - 36) / Math.max(100, iconSize + 24))));
}
