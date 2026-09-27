const test=require('node:test');
const assert=require('node:assert/strict');
const {aggregate,summaryForInvoice}=require('../carrier-ytd.js');

test('groups invoiced and paid YTD dispatch earnings by carrier',()=>{
  const rows=[
    {id:'1',carrier_id:'a',carrier:'Alpha',status:'Invoiced',rate:2500,commission_pct:8,invoiced_at:'2026-02-01T12:00:00Z'},
    {id:'2',carrier_id:'a',carrier:'Alpha',status:'Paid',rate:1500,commission_pct:10,invoiced_at:'2026-03-01T12:00:00Z',paid_at:'2026-03-20T12:00:00Z'},
    {id:'3',carrier_id:'b',carrier:'Bravo',status:'Paid',rate:1000,commission_pct:7,invoiced_at:'2026-04-01T12:00:00Z',paid_at:'2026-04-10T12:00:00Z'}
  ];
  assert.deepEqual(aggregate(rows,2026),[
    {key:'id:a',carrier:'Alpha',earnings:350,gross:4000,billedLoads:2},
    {key:'id:b',carrier:'Bravo',earnings:70,gross:1000,billedLoads:1}
  ]);
});

test('calculates each invoice YTD only through that invoice date',()=>{
  const rows=[
    {carrier:'Alpha',rate:1000,commission_pct:10,invoiced_at:'2026-01-10T12:00:00Z'},
    {carrier:'Alpha',rate:2000,commission_pct:10,invoiced_at:'2026-03-15T20:00:00Z'},
    {carrier:'Alpha',rate:9000,commission_pct:10,invoiced_at:'2026-04-01T12:00:00Z'},
    {carrier:'Bravo',rate:5000,commission_pct:10,invoiced_at:'2026-02-01T12:00:00Z'},
    {carrier:'Alpha',rate:7000,commission_pct:10,invoiced_at:'2025-12-31T12:00:00Z'}
  ];
  assert.deepEqual(summaryForInvoice(rows,'Alpha','2026-03-15T08:00:00Z'),{
    earnings:300,gross:3000,billedLoads:2,year:2026
  });
});

test('excludes non-invoiced and prior-year loads, and safely handles invalid numbers',()=>{
  const rows=[
    {carrier:'Alpha',rate:900,commission_pct:8,invoiced_at:null},
    {carrier:'Alpha',rate:900,commission_pct:8,invoiced_at:'2025-12-31T12:00:00Z'},
    {carrier:'Bravo',rate:'not-a-number',commission_pct:8,invoiced_at:'2026-01-02T12:00:00Z'}
  ];
  assert.deepEqual(aggregate(rows,2026),[
    {key:'name:bravo',carrier:'Bravo',earnings:0,gross:0,billedLoads:1}
  ]);
});
