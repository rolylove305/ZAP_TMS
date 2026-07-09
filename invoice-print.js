(()=>{
const cfg=window.ZAP_TMS_CONFIG;
const sb=window.supabase.createClient(cfg.url,cfg.token);
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const invoiceId=params.get('invoice_id');
const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money=n=>'$'+Number(n||0).toFixed(2);
const dateFmt=d=>d?new Date(d+'T00:00:00').toLocaleDateString():new Date().toLocaleDateString();
let emailCtx=null;
function setError(msg){$('invoiceStatus').className='error';$('invoiceStatus').innerHTML='<strong>'+esc(msg)+'</strong>';$('invoiceRoot').style.display='none'}
function gmailUrl(to,subject,body){return 'https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(to||'')+'&su='+encodeURIComponent(subject||'')+'&body='+encodeURIComponent(body||'')}
function loadLabel(l){return 'Load # '+(l.load_number||'-')+' | '+(l.pickup||'')+' to '+(l.delivery||'')}
function buildEmail(invoice,settings,loads,links,total,carrierEmail){
 const lines=links.map(link=>{const l=loads.get(link.load_id)||{};return loadLabel(l)+' | Dispatch fee: '+money(link.amount_due)}).join('\n');
 const subject='Invoice '+invoice.invoice_number+' - '+(invoice.carrier||'Carrier');
 const body='Hello,\n\nPlease see invoice details below. I will attach the PDF invoice before sending.\n\nInvoice: '+invoice.invoice_number+'\nCarrier: '+(invoice.carrier||'Carrier')+'\n\n'+lines+'\n\nTotal Due: '+money(total)+'\n\nPayment Info:\n'+(settings.zelle_info||'')+'\n\nThank you,\n'+(settings.company_name||'Zap Dispatch');
 return {to:carrierEmail||'',subject,body};
}
function render(invoice,settings,links,loadRows,carrierEmail){
 const loadMap=new Map(loadRows.map(l=>[l.id,l]));
 const total=links.reduce((s,link)=>s+Number(link.amount_due||0),0)||Number(invoice.total||0);
 emailCtx=buildEmail(invoice,settings,loadMap,links,total,carrierEmail);
 const rows=links.map(link=>{
   const l=loadMap.get(link.load_id)||{};
   const rate=Number(l.rate||0),pct=Number(l.commission_pct||0),due=Number(link.amount_due||0);
   return '<tr><td>'+esc(l.load_number||'-')+'</td><td>'+esc(l.pickup||'-')+'</td><td>'+esc(l.delivery||'-')+'</td><td>'+esc(l.pickup_date||'-')+'</td><td>'+esc(l.delivery_date||'-')+'</td><td class="num">'+money(rate)+'</td><td class="num">'+Number(pct||0).toFixed(1)+'%</td><td class="num">'+money(due)+'</td></tr>';
 }).join('');
 $('invoiceRoot').innerHTML=
   '<div class="invoice-top"><div class="brand"><h1>'+esc(settings.company_name||'Zap Dispatch')+'</h1><p>'+esc(settings.email||'')+'</p><p>'+esc(settings.phone||'')+'</p></div><div class="invoice-meta"><h2>Invoice '+esc(invoice.invoice_number||'')+'</h2><p>Date: '+esc(dateFmt(invoice.invoice_date))+'</p></div></div>'+
   '<div class="invoice-grid"><div class="box"><h3>Bill To</h3><p><strong>'+esc(invoice.carrier||'Carrier')+'</strong></p><p>'+esc(carrierEmail||'No carrier email on file')+'</p></div><div class="box"><h3>Payment Info</h3><p>'+esc(settings.zelle_info||'Add payment info in Settings / Supabase company settings.')+'</p></div></div>'+
   '<table><thead><tr><th>Load #</th><th>Pickup</th><th>Delivery</th><th>Pickup Date</th><th>Delivery Date</th><th class="num">Rate</th><th class="num">Dispatch %</th><th class="num">Amount Due</th></tr></thead><tbody>'+rows+'</tbody></table>'+
   '<div class="total-row"><div class="total-box"><div class="total-line"><span>Total Due</span><span>'+money(total)+'</span></div></div></div>'+
   '<p class="muted" style="margin-top:22px">Thank you for your business.</p>';
 $('invoiceStatus').style.display='none';
 $('invoiceRoot').style.display='block';
 if(!isIOS())$('gmailBtn').style.display='inline-block';
}
async function init(){
 $('printBtn').onclick=()=>window.print();
 $('backBtn').onclick=()=>history.length>1?history.back():location.href='index.html';
 $('gmailBtn').onclick=()=>{if(!emailCtx?.to)return alert('No carrier email on file. Add carrier email first.');window.open(gmailUrl(emailCtx.to,emailCtx.subject,emailCtx.body),'_blank','noopener')};
 if(!invoiceId)return setError('Missing invoice_id.');
 const session=(await sb.auth.getSession()).data.session;
 if(!session)return setError('Please log in first, then open the printable invoice again.');
 const inv=await sb.from('invoices').select('*').eq('id',invoiceId).single();
 if(inv.error)return setError(inv.error.message);
 const invoice=inv.data;
 const settingsRes=await sb.from('company_settings').select('*').eq('user_id',invoice.user_id).maybeSingle();
 const settings=settingsRes.data||{company_name:'Zap Dispatch'};
 const linkRes=await sb.from('invoice_loads').select('*').eq('invoice_id',invoiceId);
 if(linkRes.error)return setError(linkRes.error.message);
 const links=linkRes.data||[];
 const ids=links.map(x=>x.load_id).filter(Boolean);
 const loadRes=ids.length?await sb.from('loads').select('*').in('id',ids):{data:[],error:null};
 if(loadRes.error)return setError(loadRes.error.message);
 const carrierRes=await sb.from('carriers').select('email').eq('name',invoice.carrier||'').maybeSingle();
 render(invoice,settings,links,loadRes.data||[],carrierRes.data?.email||'');
}
window.addEventListener('DOMContentLoaded',init);
})();
