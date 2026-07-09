(()=>{
/* release/invoices-safe: device-aware invoicing, manually merged.
   - invoice record creation (get_next_invoice_number, invoices, invoice_loads) unchanged
   - Gmail compose (mail.google.com, built with encodeURIComponent) works fine
     on desktop but showed raw %20/%0A in the iOS Gmail app, so it's now
     rendered ONLY when !isIOS. iOS never gets a Gmail/mailto/window.open
     email path — Copy email text (always plain, no encoding) is its
     equivalent there.
   - "Open printable invoice" is a real <a href target="_blank"> anchor to
     invoice-print.html?invoice_id=<id>, not a JS window.open() button —
     window.open() did not reliably open on the user's device. A second
     "Open in this tab" anchor (no target) is the fallback if the new-tab
     link doesn't work either.
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
function printableUrl(invoiceId){return 'invoice-print.html?invoice_id='+encodeURIComponent(invoiceId)}
function showInvoiceModal(ctx){
  let m=document.getElementById('ziModal');
  if(!m){m=document.createElement('div');m.id='ziModal';m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px';document.body.appendChild(m)}
  const lines=ctx.items.map(x=>'<p class="muted" style="margin:4px 0">Load # '+esc(x.load_number||'-')+' • '+esc((x.pickup||'')+' → '+(x.delivery||''))+' • '+money(x.__due)+'</p>').join('');
  const note=isIOS
    ? 'On iPhone: use Copy email text and paste it into the Gmail app, or tap Open printable invoice for the PDF.'
    : 'Use Open Gmail draft to prefill an email, Open printable invoice for the PDF, or Copy email text to paste it elsewhere.';
  const printUrl=printableUrl(ctx.invoiceId);
  m.innerHTML='<div class="card" style="width:min(560px,96vw);max-height:88vh;overflow:auto">'
    +'<div class="section-title"><h2>Invoice '+esc(ctx.invoiceNumber)+'</h2><button class="small-btn" id="ziClose">Close</button></div>'
    +'<p class="muted">'+esc(ctx.carrier)+' • '+ctx.items.length+' load(s)'+(ctx.email?' • Carrier email: '+esc(ctx.email):' • No carrier email on file')+'</p>'
    +lines
    +'<p style="font-weight:800;font-size:18px;margin:10px 0">Total Due: '+money(ctx.total)+'</p>'
    +'<div class="card-actions" style="flex-wrap:wrap">'
      +(isIOS?'':'<a class="small-btn" id="ziGmail" href="'+esc(ctx.gUrl)+'" target="_blank" rel="noopener">Open Gmail draft</a>')
      +'<a class="small-btn" id="ziPrint" href="'+esc(printUrl)+'" target="_blank" rel="noopener">Open printable invoice</a>'
      +'<a class="small-btn" id="ziPrintSame" href="'+esc(printUrl)+'">Open in this tab</a>'
      +'<button class="small-btn" id="ziCopy">Copy email text</button>'
      +'<button class="small-btn" id="ziMark">Mark selected loads as Invoiced</button>'
    +'</div>'
    +'<p class="muted">'+esc(note)+'</p></div>';
  const unselect=()=>qa('.invoice-select:checked').forEach(x=>x.checked=false);
  m.querySelector('#ziClose').onclick=()=>{m.remove()};
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
setInterval(()=>{loadCompanySettings();addTop();markCards()},1500);
})();
