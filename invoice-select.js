(()=>{
/* release/invoices-safe: device-aware invoicing, manually merged.
   - invoice record creation (get_next_invoice_number, invoices, invoice_loads) unchanged
   - Gmail compose (mail.google.com, built with encodeURIComponent) works fine
     on desktop but showed raw %20/%0A in the iOS Gmail app, so it's now
     rendered ONLY when !isIOS. iOS never gets a Gmail/mailto/window.open
     email path — Copy email text (always plain, no encoding) is its
     equivalent there.
   - "View / Print invoice" renders an in-app printable overlay using the
     invoice data already in the modal context — it does NOT navigate to
     invoice-print.html. That standalone page rendered a blank page in
     production for reasons not yet solved; the overlay avoids the whole
     separate-page/separate-script-load path entirely.
   - markCards()/revokeLink() are KEPT from main as-is: this release does
     not include the app.js Load Board v2 rewrite, so checkbox and Revoke
     Link rendering still needs to be injected here, index-based, same as
     it works on main today. */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
const loads=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
const ok=s=>['delivered','invoiced','paid'].includes(String(s||'').toLowerCase());
const esc=s=>String(s??'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
const money=n=>'$'+Number(n||0).toFixed(2);
async function currentUser(){return (await sb.auth.getSession()).data.session?.user}
async function settings(){const u=await currentUser();if(!u)return {};let r=await sb.from('company_settings').select('*').eq('user_id',u.id).maybeSingle();if(r.error)return {};return r.data||{company_name:'Zap Dispatch',invoice_footer:'Thank you for your business.'}}
function loadCompanySettings(){if(q('#companySettingsHelper'))return;const c=document.createElement('script');c.id='companySettingsHelper';c.src='company-settings.js?v=4300';document.body.appendChild(c)}
function addTop(){if(q('#invoiceSelectedBtn'))return;const bar=q('#folderBar')||q('#loads .section-title');if(!bar)return;const b=document.createElement('button');b.id='invoiceSelectedBtn';b.className='primary-btn';b.textContent='Invoice selected';b.style.marginTop='10px';b.onclick=invoiceSelected;bar.appendChild(b)}
async function revokeLink(id){if(!confirm('Revoke driver link for this load? The driver portal link will stop working.'))return;const r=await sb.rpc('revoke_driver_link',{p_load_id:id});if(r.error)return alert(r.error.message);alert('Driver link revoked. Generate a new Driver Link if needed.')}
function markCards(){const arr=loads();qa('#loadsList .list-card').forEach((card,i)=>{const l=arr[i];if(!l)return;if(ok(l.status)){let box=card.querySelector('.invoice-select-box');if(!box){box=document.createElement('label');box.className='invoice-select-box';box.style.cssText='display:flex;gap:8px;align-items:center;margin-top:8px;font-weight:800;color:#86efac';box.innerHTML='<input type="checkbox" class="invoice-select"> Select for invoice';card.prepend(box)}box.querySelector('input').dataset.id=l.id}let acts=card.querySelector('.card-actions');if(!acts){acts=document.createElement('div');acts.className='card-actions';card.appendChild(acts)}if(!card.querySelector('.revoke-link-btn')){const b=document.createElement('button');b.className='small-btn revoke-link-btn';b.textContent='Revoke Link';b.onclick=()=>revokeLink(l.id);acts.appendChild(b)}})}
async function carrierEmail(carrier){const r=await sb.from('carriers').select('email').eq('name',carrier).maybeSingle();return r.data?.email||''}
function gmailUrl(to,subject,body){return 'https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(to||'')+'&su='+encodeURIComponent(subject||'')+'&body='+encodeURIComponent(body||'')}
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
  const logo='<img src="'+esc(ctx.st.logo_url||'https://app.zapdispatch.com/zap-logo-light.png')+'" onerror="this.onerror=null;this.src=\'https://app.zapdispatch.com/zap-logo-light.png\'" style="max-height:65px;max-width:180px;margin-bottom:10px">';
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
function showInvoiceModal(ctx){
  let m=document.getElementById('ziModal');
  if(!m){m=document.createElement('div');m.id='ziModal';m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px';document.body.appendChild(m)}
  const lines=ctx.items.map(x=>'<p class="muted" style="margin:4px 0">Load # '+esc(x.load_number||'-')+' • '+esc((x.pickup||'')+' → '+(x.delivery||''))+' • '+money(x.__due)+'</p>').join('');
  const note=isIOS
    ? 'On iPhone: use Copy email text and paste it into the Gmail app, or tap View / Print invoice for the PDF.'
    : 'Use Open Gmail draft to prefill an email, View / Print invoice for the PDF, or Copy email text to paste it elsewhere.';
  m.innerHTML='<div class="card" style="width:min(560px,96vw);max-height:88vh;overflow:auto">'
    +'<div class="section-title"><h2>Invoice '+esc(ctx.invoiceNumber)+'</h2><button class="small-btn" id="ziClose">Close</button></div>'
    +'<p class="muted">'+esc(ctx.carrier)+' • '+ctx.items.length+' load(s)'+(ctx.email?' • Carrier email: '+esc(ctx.email):' • No carrier email on file')+'</p>'
    +lines
    +'<p style="font-weight:800;font-size:18px;margin:10px 0">Total Due: '+money(ctx.total)+'</p>'
    +'<div class="card-actions" style="flex-wrap:wrap">'
      +(isIOS?'':'<a class="small-btn" id="ziGmail" href="'+esc(ctx.gUrl)+'" target="_blank" rel="noopener">Open Gmail draft</a>')
      +'<button class="small-btn" id="ziView">View / Print invoice</button>'
      +'<button class="small-btn" id="ziCopy">Copy email text</button>'
      +'<button class="small-btn" id="ziMark">Mark selected loads as Invoiced</button>'
    +'</div>'
    +'<p class="muted">'+esc(note)+'</p></div>';
  const unselect=()=>qa('.invoice-select:checked').forEach(x=>x.checked=false);
  m.querySelector('#ziClose').onclick=()=>{m.remove()};
  m.querySelector('#ziView').onclick=()=>showPrintableOverlay({invoiceNumber:ctx.invoiceNumber,carrier:ctx.carrier,createdAt:new Date().toLocaleDateString(),rows:ctx.rows,total:ctx.total,st:ctx.st});
  m.querySelector('#ziCopy').onclick=async()=>{
    /* plain text only — no encodeURIComponent, no mailto:, no Gmail URL */
    const text='Subject: '+ctx.subject+'\n\n'+ctx.body;
    let done=false;
    try{await navigator.clipboard.writeText(text);done=true}
    catch{try{const t=document.createElement('textarea');t.value=text;m.appendChild(t);t.select();done=document.execCommand('copy');t.remove()}catch{done=false}}
    alert(done?'Email text copied.':'Copy failed — tap and hold the text areas above to copy manually.');
  };
  m.querySelector('#ziMark').onclick=async()=>{
    const b=m.querySelector('#ziMark');b.disabled=true;
    const up=await sb.from('loads').update({status:'Invoiced'}).in('id',ctx.ids);
    if(up.error){b.disabled=false;return alert(up.error.message)}
    b.textContent='Marked as Invoiced ✓';
    unselect();
    if(typeof loadCloud==='function')await loadCloud();
  };
}
async function invoiceSelected(){
 const ids=qa('.invoice-select:checked').map(x=>x.dataset.id).filter(Boolean);
 if(!ids.length)return alert('Select at least one load.');
 const u=await currentUser();if(!u)return alert('Login again first.');
 const r=await sb.from('loads').select('*').in('id',ids).order('delivery_date',{ascending:true});
 if(r.error)return alert(r.error.message);
 const items=r.data||[];if(!items.length)return alert('No loads found.');
 const bad=items.filter(x=>!ok(x.status));
 if(bad.length)return alert('Only Delivered, Invoiced, or Paid loads can be invoiced.');
 const carriers=[...new Set(items.map(x=>x.carrier||''))];
 if(carriers.length>1)return alert('Select loads from only one carrier.');
 const st=await settings();
 const missingPct=items.find(x=>x.commission_pct===null||x.commission_pct===undefined||x.commission_pct===""||!Number.isFinite(Number(x.commission_pct))||Number(x.commission_pct)<0||Number(x.commission_pct)>100);
 if(missingPct)return alert('Load # '+(missingPct.load_number||'-')+' does not have a valid locked dispatch percentage. Open the carrier record and save its agreed percentage first.');
 const num=await sb.rpc('get_next_invoice_number');
 if(num.error)return alert(num.error.message);
 const invoiceNumber=num.data;
 let total=0;
 items.forEach(x=>{const rate=Number(x.rate||0),pct=Number(x.commission_pct);x.__due=rate*pct/100;total+=x.__due});
 const carrier=carriers[0]||'Carrier';
 const inv=await sb.from('invoices').insert({user_id:u.id,invoice_number:invoiceNumber,carrier,total}).select('id').single();
 if(inv.error)return alert(inv.error.message);
 const invoiceId=inv.data.id;
 const ilIns=await sb.from('invoice_loads').insert(items.map(x=>({invoice_id:invoiceId,load_id:x.id,amount_due:x.__due}))).select('load_id,amount_due');
 if(ilIns.error)alert('Invoice '+invoiceNumber+' was created, but saving its load line items failed: '+ilIns.error.message+'. The invoice is incomplete — check Saved Invoices before sending it.');
 else{
   const createdCount=(ilIns.data||[]).length;
   if(createdCount!==items.length)alert('Invoice '+invoiceNumber+': only '+createdCount+' of '+items.length+' load line item(s) were saved. The invoice shown now uses the full selected load data, but Saved Invoices may show it as incomplete later.');
 }
 const email=await carrierEmail(carrier);
 const lineText=items.map(x=>'Load # '+(x.load_number||'-')+' | '+(x.pickup||'')+' to '+(x.delivery||'')+' | Dispatch fee: '+money(x.__due)).join('\n');
 const subject='Invoice '+invoiceNumber+' - '+carrier;
 const body='Hello,\n\nPlease see invoice details below. I will attach the PDF invoice before sending.\n\nInvoice: '+invoiceNumber+'\nCarrier: '+carrier+'\n\n'+lineText+'\n\nTotal Due: '+money(total)+'\n\nPayment Info:\n'+(st.zelle_info||'')+'\n\nThank you,\n'+(st.company_name||'Zap Dispatch');
 const gUrl=gmailUrl(email,subject,body); /* only linked from the modal when !isIOS */
 const rows=items.map(x=>{const rate=Number(x.rate||0),due=x.__due;const pct=rate>0?((due/rate)*100).toFixed(1).replace(/\.0$/,'')+'%':'-';return{loadNumber:x.load_number||'-',lane:(x.pickup||'')+' → '+(x.delivery||''),date:x.delivery_date||x.pickup_date||'',rate,pctLabel:pct,due}});
 showInvoiceModal({ids,items,carrier,email,total,invoiceNumber,invoiceId,subject,body,gUrl,rows,st});
}
setInterval(()=>{loadCompanySettings();addTop();markCards()},1500);
})();
