import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCatalog, categoryOf, favoriteApps, fitColumns, searchCatalog} from '../lib/catalog.js';

const info = (id, name, options = {}) => ({
    get_id: () => id,
    get_name: () => name,
    get_categories: () => options.categories ?? '',
    get_description: () => options.description ?? '',
    get_keywords: () => options.keywords ?? [],
    should_show: () => options.visible ?? true,
});

test('filters hidden desktop entries and respects Shell app filtering', () => {
    const entries = [
        info('a.desktop', 'Editor'),
        info('b.desktop', 'Hidden', {visible: false}),
        info('c.desktop', 'Restricted'),
    ];
    const result = buildCatalog(entries, app => app.should_show() && app.get_id() !== 'c.desktop');
    assert.deepEqual(result.map(item => item.id), ['a.desktop']);
    assert.deepEqual(buildCatalog(entries).map(item => item.id), ['a.desktop', 'c.desktop']);
});

test('uses desktop categories', () => {
    assert.equal(categoryOf('Development;IDE;'), 'Development');
    assert.equal(categoryOf('Network;WebBrowser;'), 'Internet');
    assert.equal(categoryOf('AudioVideo;Player;'), 'Multimedia');
    assert.equal(categoryOf('Office;Spreadsheet;'), 'Office');
    assert.equal(categoryOf(''), 'Other');
});

test('search uses descriptions and keywords and prioritizes title prefix', () => {
    const catalog = buildCatalog([
        info('1', 'Text Studio', {categories: 'Utility;', description: 'Markdown editor'}),
        info('2', 'Studio Text', {categories: 'Development;', keywords: ['Markdown', 'IDE']}),
        info('3', 'Terminal', {categories: 'Utility;'}),
    ]);
    assert.deepEqual(searchCatalog(catalog, 'studio text').map(a => a.name),
        ['Studio Text', 'Text Studio']);
    assert.deepEqual(searchCatalog(catalog, 'markdown IDE').map(a => a.id), ['2']);
    assert.deepEqual(searchCatalog(catalog, 'markdown', 'Utilities').map(a => a.id), ['1']);
});

test('retains more than 72 apps and distinct desktop IDs for duplicate names', () => {
    const catalog = buildCatalog(Array.from({length: 125}, (_, index) =>
        info(String(index), 'Same name')));
    assert.equal(searchCatalog(catalog, '').length, 125);
    assert.equal(searchCatalog(catalog, 'same name').length, 125);
});

test('favorites keep dock order and skip missing, restricted, and repeated IDs', () => {
    const catalog = buildCatalog([
        info('a.desktop', 'Editor'),
        info('b.desktop', 'Hidden', {visible: false}),
        info('c.desktop', 'Terminal'),
        info('d.desktop', 'Writer'),
    ]);
    const result = favoriteApps(catalog,
        ['c.desktop', 'b.desktop', 'missing.desktop', 'c.desktop', 'a.desktop', 'd.desktop'], 2);
    assert.deepEqual(result.map(item => item.id), ['c.desktop', 'a.desktop']);
});

test('responsive columns account for the requested icon size', () => {
    assert.equal(fitColumns(860, 7), 7);
    assert.equal(fitColumns(350, 7), 3);
    assert.equal(fitColumns(350, 7, 80), 3);
    assert.equal(fitColumns(310, 7, 80), 2);
    assert.equal(fitColumns(860, 4), 4);
    assert.equal(fitColumns(120, 7), 1);
});
