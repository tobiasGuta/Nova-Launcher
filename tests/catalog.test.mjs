import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryOf,buildCatalog,searchCatalog,fitColumns} from '../lib/catalog.js';

const info = (id,name,categories = '',visible = true,description = '') => ({
    get_id:() => id, get_name:() => name,
    get_categories:() => categories, get_description:() => description,
    should_show:() => visible,
});

test('filters hidden desktop entries',() => {
    const result = buildCatalog([
        info('a.desktop','Editor','Development;'),
        info('b.desktop','Private','Utility;',false),
    ]);
    assert.deepEqual(result.map(item => item.id),['a.desktop']);
});
test('uses desktop categories',() => {
    assert.equal(categoryOf('Development;IDE;'),'Development');
    assert.equal(categoryOf('Network;WebBrowser;'),'Internet');
    assert.equal(categoryOf('AudioVideo;'),'Other');
});
test('search matches words and prioritizes title prefix',() => {
    const data = buildCatalog([
        info('1','Text Studio','Utility;'),
        info('2','Studio Text','Development;'),
        info('3','Terminal','Utility;'),
    ]);
    assert.deepEqual(searchCatalog(data,'studio text').items.map(a => a.name),
        ['Studio Text','Text Studio']);
    assert.equal(searchCatalog(data,'','Development').total,1);
});
test('caps visible actor count without losing total',() => {
    const data = Array.from({length:125},(_,i) => ({
        id:String(i),name:'App '+i,description:'',category:'Other',
    }));
    const result = searchCatalog(data,'','All',72);
    assert.equal(result.items.length,72);
    assert.equal(result.total,125);
});
test('responsive columns fit',() => {
    assert.equal(fitColumns(820,6),6);
    assert.equal(fitColumns(350,6),2);
    assert.equal(fitColumns(820,4),4);
});
