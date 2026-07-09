(()=>{
/* Step 5 saved invoices (stabilize-load-board).
   Adds a real saved-invoices list to the Invoices / Payments tab without
   changing app.js, Load Board, Driver Link, invoice creation, or Supabase schema.
   Reads the existing invoices table directly and opens the existing printable
   page: invoice-print.html?invoice_id=<id>. */
const q=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const money=n=>'$'+(Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2});
let loadedOnce=false;
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
async function renderSavedInvoices(force=false){
  const list=ensureContainer();
  if(!list)return;
  if(loadedOnce&&!force)return;
  loadedOnce=true;
  if(!window.sb){list.innerHTML="<p class='muted'>Saved invoices could not load yet.</p>";return}
  list.innerHTML="<p class='muted'>Loading saved invoices…</p>";
  const r=await window.sb.from('invoices').select('id,invoice_number,carrier,total,created_at').order('created_at',{ascending:false});
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
      +'<div class="card-actions"><button class="small-btn" data-saved-invoice-print>Open printable invoice</button></div>';
    el.querySelector('[data-saved-invoice-print]').onclick=()=>{
      const url='invoice-print.html?invoice_id='+encodeURIComponent(inv.id);
      const w=window.open(url,'_blank');
      if(!w)alert('Popup blocked. Allow popups for this site in your browser settings, then tap "Open printable invoice" again.');
    };
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
