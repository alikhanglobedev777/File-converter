const test = require('node:test');
const assert = require('node:assert/strict');
const { spatialRows } = require('../services/pdf-spatial-rows');

const part = (text,x,y,width=30,size=10) => ({text,x,y,width,size,font:'Arial',color:'000000'});

test('keeps separated left and right columns in one page row', () => {
 const rows=spatialRows([part('Dec 2025',450,100,65),part('Recruiter',32,100,58)]);
 assert.equal(rows.length,1);
 assert.deepEqual(rows[0].segments.map(s=>s.text),['Recruiter','Dec 2025']);
});

test('does not collapse bullet lines or vertical whitespace', () => {
 const rows=spatialRows([part('• First',40,210,45),part('Heading',30,20,50,16),part('• Second',40,235,50)]);
 assert.deepEqual(rows.map(r=>r.y),[20,210,235]);
});

test('joins adjacent text glyphs and adds spaces for visible gaps', () => {
 const rows=spatialRows([part('Full',30,20,21),part('cycle',54,20,24),part('hiring',82,20,30)]);
 assert.equal(rows[0].segments.map(s=>s.text).join(' '),'Full cycle hiring');
});
