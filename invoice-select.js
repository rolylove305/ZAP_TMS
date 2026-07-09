(()=>{
/* Step 4E (stabilize-load-board): device-aware invoicing.
   - invoice record creation (get_next_invoice_number, invoices, invoice_loads) unchanged
   - Gmail compose (mail.google.com, built with encodeURIComponent) works fine
     on desktop but showed raw %20/%0A in the iOS Gmail app, so it's now
     rendered ONLY when !isIOS. iOS never gets a Gmail/mailto/window.open
     email path — Copy email text (always plain, no encoding) is its
     equivalent there.
   - "Open printable invoice" is restored on BOTH platforms, linking to
     invoice-print.html?invoice_id=<id> via a synchronous window.open()
     called directly from the tap (works on iOS Safari); alerts clearly if
     the popup is blocked. That page has its own device-aware Gmail button.
   - index-based markCards() removed: checkboxes and Revoke Link are rendered
     natively by app.js renderLoads() with correct data-id since Step 1 */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
const ok=s=>['delivered','invoiced','paid'].includes(String(s||'').toLowerCase());
const esc=s=>String(s??'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
const money=n=>'$'+Number(n||0).toFixed(2);
async function currentUser(){return (await sb.auth.getSession()).data.session?.user}
async function settings(){const u=await currentUser();if(!u)return {};let r=await sb.from('company_settings').select('*').eq('user_id',u.id).maybeSingle();if(r.error)return {};return r.data||{company_name:'Zap Dispatch',invoice_footer:'Thank you for your business.'}}
function loadCompanySettings(){if(q('#companySettingsHelper'))return;const c=document.createElement('script');c.id='companySettingsHelper';c.src='company-settings.js?v=4300';document.body.appendChild(c)}
function addTop(){if(q('#invoiceSelectedBtn'))return;const bar=q('#folderBar')||q('#loads .section-title');if(!bar)return;const b=document.createElement('button');b.id='invoiceSelectedBtn';b.className='primary-btn';b.textContent='Invoice selected';b.style.marginTop='10px';b.onclick=invoiceSelected;bar.appendChild(b)}
async function carrierEmail(carrier){const r=await sb.from('carriers').select('email').eq('name',carrier).maybeSingle();return r.data?.email||''}
function gmailUrl(to,subject,body){return 'https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(to||'')+'&su='+encodeURIComponent(subject||'')+'&body='+encodeURIComponent(body||'')}
function openPrintable(invoiceId){
  const url='invoice-print.html?invoice_id='+encodeURIComponent(invoiceId);
  const w=window.open(url,'_blank'); /* synchronous, direct tap = valid on iOS Safari */
  if(!w)return alert('Popup blocked. Allow popups for this site in your browser settings, then tap "Open printable invoice" again.');
}
function showInvoiceModal(ctx){
  let m=document.getElementById('ziModal');
  if(!m){m=document.createElement('div');m.id='ziModal';m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px';document.body.appendChild(m)}
  const lines=ctx.items.map(x=>'<p class="muted" style="margin:4px 0">Load # '+esc(x.load_number||'-')+' \u2022 '+esc((x.pickup||'')+' \u2192 '+(x.delivery||''))+' \u2022 '+money(x.__due)+'</p>').join('');
  const note=isIOS
    ? 'On iPhone: use Copy email text and paste it into the Gmail app, or tap Open printable invoice for the PDF.'
    : 'Use Open Gmail draft to prefill an email, Open printable invoice for the PDF, or Copy email text to paste it elsewhere.';
  m.innerHTML='<div class="card" style="width:min(560px,96vw);max-height:88vh;overflow:auto">'
    +'<div class="section-title"><h2>Invoice '+esc(ctx.invoiceNumber)+'</h2><button class="small-btn" id="ziClose">Close</button></div>'
    +'<p class="muted">'+esc(ctx.carrier)+' \u2022 '+ctx.items.length+' load(s)'+(ctx.email?' \u2022 Carrier email: '+esc(ctx.email):' \u2022 No carrier email on file')+'</p>'
    +lines
    +'<p style="font-weight:800;font-size:18px;margin:10px 0">Total Due: '+money(ctx.total)+'</p>'
    +'<div class="card-actions" style="flex-wrap:wrap">'
      +(isIOS?'':'<a class="small-btn" id="ziGmail" href="'+esc(ctx.gUrl)+'" target="_blank" rel="noopener">Open Gmail draft</a>')
      +'<button class="small-btn" id="ziPrint">Open printable invoice</button>'
      +'<button class="small-btn" id="ziCopy">Copy email text</button>'
      +'<button class="small-btn" id="ziMark">Mark selected loads as Invoiced</button>'
    +'</div>'
    +'<p class="muted">'+esc(note)+'</p></div>';
  const unselect=()=>qa('.invoice-select:checked').forEach(x=>x.checked=false);
  m.querySelector('#ziClose').onclick=()=>{m.remove()};
  m.querySelector('#ziPrint').onclick=()=>openPrintable(ctx.invoiceId);
  m.querySelector('#ziCopy').onclick=async()=>{
    /* plain text only — no encodeURIComponent, no mailto:, no Gmail URL */
    const text='Subject: '+ctx.subject+'\n\n'+ctx.body;
    let done=false;
    try{await navigator.clipboard.writeText(text);done=true}
    catch{try{const t=document.createElement('textarea');t.value=text;m.appendChild(t);t.select();done=document.execCommand('copy');t.remove()}catch{done=false}}
    alert(done?'Email text copied.':'Copy failed \u2014 tap and hold the text areas above to copy manually.');
  };
  m.querySelector('#ziMark').onclick=async()=>{
    const b=m.querySelector('#ziMark');b.disabled=true;
    const up=await sb.from('loads').update({status:'Invoiced'}).in('id',ctx.ids);
    if(up.error){b.disabled=false;return alert(up.error.message)}
    b.textContent='Marked as Invoiced \u2713';
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
 const num=await sb.rpc('get_next_invoice_number');
 if(num.error)return alert(num.error.message);
 const invoiceNumber=num.data;
 let total=0;
 items.forEach(x=>{const rate=Number(x.rate||0),pct=Number(x.commission_pct||st.default_commission_pct||0);x.__due=rate*pct/100;total+=x.__due});
 const carrier=carriers[0]||'Carrier';
 const inv=await sb.from('invoices').insert({user_id:u.id,invoice_number:invoiceNumber,carrier,total}).select('id').single();
 if(inv.error)return alert(inv.error.message);
 const invoiceId=inv.data.id;
 await sb.from('invoice_loads').insert(items.map(x=>({invoice_id:invoiceId,load_id:x.id,amount_due:x.__due})));
 const email=await carrierEmail(carrier);
 const lineText=items.map(x=>'Load # '+(x.load_number||'-')+' | '+(x.pickup||'')+' to '+(x.delivery||'')+' | Dispatch fee: '+money(x.__due)).join('\n');
 const subject='Invoice '+invoiceNumber+' - '+carrier;
 const body='Hello,\n\nPlease see invoice details below. I will attach the PDF invoice before sending.\n\nInvoice: '+invoiceNumber+'\nCarrier: '+carrier+'\n\n'+lineText+'\n\nTotal Due: '+money(total)+'\n\nPayment Info:\n'+(st.zelle_info||'')+'\n\nThank you,\n'+(st.company_name||'Zap Dispatch');
 const gUrl=gmailUrl(email,subject,body); /* only linked from the modal when !isIOS */
 showInvoiceModal({ids,items,carrier,email,total,invoiceNumber,invoiceId,subject,body,gUrl});
}
setInterval(()=>{loadCompanySettings();addTop()},1500);
})();
