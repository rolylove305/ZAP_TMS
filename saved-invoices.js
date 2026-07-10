(()=>{
/* Step 6 saved invoice deletion (stabilize-load-board).
   Uses DELETE on invoices only; invoice_loads are removed by the existing
   ON DELETE CASCADE foreign key. Does not delete loads or change statuses.
   "View / Print invoice" renders an in-app printable overlay (fetches
   invoice_loads + loads + company_settings for this invoice) instead of
   navigating to invoice-print.html, which rendered blank in production. */
const q=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const money=n=>'$'+(Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2});
let loadedOnce=false;
function ensurePrintStyle(){
  if(document.getElementById('zpPrintStyle'))return;
  const s=document.createElement('style');
  s.id='zpPrintStyle';
  s.textContent='@media print{body>*:not(#zpInvoiceOverlay){display:none!important}#zpInvoiceOverlay{position:static!important;background:#fff!important;padding:0!important}#zpInvoiceCard{box-shadow:none!important;max-height:none!important;overflow:visible!important;width:100%!important}.zp-noprint{display:none!important}}';
  document.head.appendChild(s);
}
function showPrintableOverlay(ctx){
  ensurePrintStyle();
  let o=document.getElementById('zpInvoiceOverlay');
  if(!o){o=document.createElement('div');o.id='zpInvoiceOverlay';o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:18px;overflow:auto';document.body.appendChild(o)}
  const hasRows=!!(ctx.rows&&ctx.rows.length);
  const logo=ctx.st.logo_url?'<img src="'+esc(ctx.st.logo_url)+'" style="max-height:65px;max-width:180px;margin-bottom:10px">':'';
  const contact=[ctx.st.email,ctx.st.phone].filter(Boolean).map(esc).join('<br>');
  const pay=ctx.st.zelle_info?esc(ctx.st.zelle_info):'Zelle payment details not set.';
  const warningHtml=ctx.warning?'<p style="color:#92400e;background:#fffbeb;border:1px solid #fde68a;padding:10px;border-radius:6px;margin:14px 0">'+esc(ctx.warning)+'</p>':'';
  let bodyHtml;
  if(hasRows){
    const rows=ctx.rows.map(r=>'<tr><td>'+esc(r.loadNumber)+'</td><td>'+esc(r.lane)+'</td><td>'+esc(r.date)+'</td><td>'+money(r.rate)+'</td><td>'+esc(r.pctLabel)+'</td><td>'+money(r.due)+'</td></tr>').join('');
    const grossTotal=ctx.rows.reduce((s,r)=>s+Number(r.rate||0),0);
    bodyHtml='<table style="width:100%;border-collapse:collapse;margin-top:22px"><thead><tr>'
      +'<th style="border:1px solid #ccc;padding:9px;background:#f2f2f2;text-align:left;font-size:13px">Load #</th>'
      +'<th style="border:1px solid #ccc;padding:9px;background:#f2f2f2;text-align:left;font-size:13px">Lane</th>'
      +'<th style="border:1px solid #ccc;padding:9px;background:#f2f2f2;text-align:left;font-size:13px">Date</th>'
      +'<th style="border:1px solid #ccc;padding:9px;background:#f2f2f2;text-align:left;font-size:13px">Rate</th>'
      +'<th style="border:1px solid #ccc;padding:9px;background:#f2f2f2;text-align:left;font-size:13px">Dispatch %</th>'
      +'<th style="border:1px solid #ccc;padding:9px;background:#f2f2f2;text-align:left;font-size:13px">Amount Due</th>'
    +'</tr></thead><tbody style="font-size:13px">'+rows+'</tbody></table>'
    +'<div style="text-align:right;font-size:18px;font-weight:800;margin-top:18px">Total Load Rates: '+money(grossTotal)+'</div>';
  } else {
    bodyHtml='<p style="margin-top:22px;padding:14px;border:1px solid #ddd;background:#fafafa;border-radius:6px;color:#555">'+esc(ctx.emptyMessage||'No load details found for this saved invoice.')+'</p>';
  }
  o.innerHTML='<div id="zpInvoiceCard" style="width:min(800px,96vw);max-height:92vh;overflow:auto;background:#fff;color:#111;padding:30px;border-radius:10px">'
    +'<div class="zp-noprint" style="margin:0 0 18px;display:flex;gap:8px;flex-wrap:wrap">'
      +'<button id="zpPrint" style="background:#0f766e;color:#fff;border:0;padding:10px 14px;border-radius:8px;cursor:pointer;font-size:14px">Print / Save as PDF</button>'
      +'<button id="zpClose" style="padding:10px 14px;border-radius:8px;cursor:pointer;font-size:14px">Close</button>'
    +'</div>'
    +'<div style="display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap">'
      +'<div>'+logo+'<h1 style="margin:0">'+esc(ctx.st.company_name||'Zap Dispatch')+'</h1><p style="color:#555">'+contact+'</p></div>'
      +'<div><h2 style="margin:0 0 6px">INVOICE</h2><b>Invoice #:</b> '+esc(ctx.invoiceNumber||'-')+'<br><b>Date:</b> '+esc(ctx.createdAt||new Date().toLocaleDateString())+'<br><b>Carrier:</b> '+esc(ctx.carrier||'-')+'</div>'
    +'</div>'
    +warningHtml
    +bodyHtml
    +'<div style="text-align:right;font-size:22px;font-weight:800;margin-top:6px">Total Due: '+money(ctx.total)+'</div>'
    +'<div style="margin-top:28px;padding:14px;border:1px solid #ddd;background:#fafafa;border-radius:6px"><b>Payment Info:</b><br>'+pay+'</div>'
    +'<p style="color:#555">'+esc(ctx.st.invoice_footer||'Thank you for your business.')+'</p>'
    +'</div>';
  o.querySelector('#zpClose').onclick=()=>o.remove();
  o.querySelector('#zpPrint').onclick=()=>window.print(); /* user-tap only, never automatic */
  o.onclick=e=>{if(e.target===o)o.remove()};
}
async function viewPrintableInvoice(inv,btn){
  btn.disabled=true;
  btn.textContent='Loading…';
  try{
    const ilR=await sb.from('invoice_loads').select('load_id,amount_due').eq('invoice_id',inv.id);
    if(ilR.error)throw new Error(ilR.error.message);
    const invoiceLoads=ilR.data||[];
    let st={};
    if(inv.user_id){
      const sR=await sb.from('company_settings').select('*').eq('user_id',inv.user_id).maybeSingle();
      st=sR.data||{};
    }
    if(!invoiceLoads.length){
      showPrintableOverlay({invoiceNumber:inv.invoice_number,carrier:inv.carrier,createdAt:inv.created_at?new Date(inv.created_at).toLocaleDateString():'',rows:[],total:inv.total,st,emptyMessage:'No load details found for this saved invoice.'});
      return;
    }
    const loadIds=invoiceLoads.map(x=>x.load_id).filter(Boolean);
    let loadsById={};
    if(loadIds.length){
      const lR=await sb.from('loads').select('*').in('id',loadIds);
      if(lR.error)throw new Error(lR.error.message);
      (lR.data||[]).forEach(l=>{loadsById[l.id]=l});
    }
    let missingCount=0;
    const rows=invoiceLoads.map(il=>{
      const l=loadsById[il.load_id];
      if(!l)missingCount++;
      const rate=l?Number(l.rate||0):0;
      const due=Number(il.amount_due||0);
      const pct=rate>0?((due/rate)*100).toFixed(1).replace(/\.0$/,'')+'%':'-';
      return{
        loadNumber:l?(l.load_number||'-'):'-',
        lane:l?((l.pickup||'')+' → '+(l.delivery||'')):'-',
        date:l?(l.delivery_date||l.pickup_date||''):'',
        rate,pctLabel:pct,due
      };
    }).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const warning=missingCount?('Original load details could not be found for '+missingCount+' of '+invoiceLoads.length+' line item(s) on this invoice. Amount Due is still accurate; Rate and load info show as "-".'):'';
    showPrintableOverlay({invoiceNumber:inv.invoice_number,carrier:inv.carrier,createdAt:inv.created_at?new Date(inv.created_at).toLocaleDateString():'',rows,total:inv.total,st,warning});
  }catch(e){
    alert('Could not load invoice: '+(e.message||String(e)));
  }finally{
    btn.disabled=false;
    btn.textContent='View / Print invoice';
  }
}
function ensureContainer(){
  const invoiceList=q('invoiceList');
  if(!invoiceList)return null;
  let list=q('savedInvoicesList');
  if(list)return list;
  const title=document.createElement('div');
  title.className='section-title';
  title.id='savedInvoicesTitle';
  title.innerHTML='<h2>Saved Invoices</h2>';
  list=document.createElement('div');
  list.id='savedInvoicesList';
  list.className='list';
  invoiceList.parentNode.insertBefore(title,invoiceList);
  invoiceList.parentNode.insertBefore(list,invoiceList);
  return list;
}
async function deleteSavedInvoice(inv,btn){
  const label=inv.invoice_number||'this invoice';
  if(!confirm('Delete invoice '+label+'? This removes it from Saved Invoices only. It will NOT delete the load or change the load status.'))return;
  btn.disabled=true;
  btn.textContent='Deleting…';
  const res=await sb.from('invoices').delete({count:'exact'}).eq('id',inv.id);
  if(res.error){btn.disabled=false;btn.textContent='Delete invoice';alert('Could not delete invoice: '+res.error.message);return}
  if(!res.count){btn.disabled=false;btn.textContent='Delete invoice';alert('Invoice was not deleted. Permission or row match failed. Please refresh and try again.');return}
  loadedOnce=false;
  await renderSavedInvoices(true);
}
async function renderSavedInvoices(force=false){
  const list=ensureContainer();
  if(!list)return;
  if(loadedOnce&&!force)return;
  loadedOnce=true;
  if(typeof sb==='undefined'){list.innerHTML="<p class='muted'>Saved invoices could not load yet.</p>";return}
  list.innerHTML="<p class='muted'>Loading saved invoices…</p>";
  const r=await sb.from('invoices').select('id,invoice_number,carrier,total,created_at,user_id').order('created_at',{ascending:false});
  if(r.error){list.innerHTML="<p class='muted'>Could not load saved invoices: "+esc(r.error.message)+"</p>";return}
  const rows=r.data||[];
  if(!rows.length){list.innerHTML="<div class='card'><p class='muted'>No saved invoices yet. Create one from Load Board → Invoice selected.</p></div>";return}
  list.textContent='';
  const frag=document.createDocumentFragment();
  rows.forEach(inv=>{
    const date=inv.created_at?new Date(inv.created_at).toLocaleDateString():'';
    const el=document.createElement('div');
    el.className='list-card';
    el.innerHTML='<h3>'+esc(inv.invoice_number||'-')+'</h3>'
      +'<p class="muted">'+esc(inv.carrier||'-')+' • '+esc(date)+'</p>'
      +'<div class="pill-row"><span class="pill green">Total Due '+money(inv.total)+'</span></div>'
      +'<div class="card-actions"><button class="small-btn" data-saved-invoice-view>View / Print invoice</button><button class="small-btn" data-saved-invoice-delete style="border-color:rgba(251,113,133,.45);color:#fda4af">Delete invoice</button></div>';
    el.querySelector('[data-saved-invoice-view]').onclick=e=>viewPrintableInvoice(inv,e.currentTarget);
    el.querySelector('[data-saved-invoice-delete]').onclick=e=>deleteSavedInvoice(inv,e.currentTarget);
    frag.appendChild(el);
  });
  list.appendChild(frag);
}
function maybeRenderFromClick(e){
  const btn=e.target.closest('[data-screen="invoices"]');
  if(!btn)return;
  setTimeout(()=>renderSavedInvoices(true),50);
}
document.addEventListener('click',maybeRenderFromClick);
setTimeout(()=>{
  ensureContainer();
  if(document.querySelector('#invoices.screen.active'))renderSavedInvoices(true);
},1200);
window.renderSavedInvoices=renderSavedInvoices;
})();
