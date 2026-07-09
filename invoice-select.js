(()=>{
const q=s=>document.querySelector(s),qa=s=>Array.from(document.querySelectorAll(s));
const ok=s=>['delivered','invoiced','paid'].includes(String(s||'').toLowerCase());
const esc=s=>String(s??'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
const money=n=>'$'+Number(n||0).toFixed(2);
async function currentUser(){return (await sb.auth.getSession()).data.session?.user}
async function settings(){const u=await currentUser();if(!u)return {};const r=await sb.from('company_settings').select('*').eq('user_id',u.id).maybeSingle();return r.data||{company_name:'Zap Dispatch'}}
function addTop(){if(q('#invoiceSelectedBtn'))return;const bar=q('#folderBar')||q('#loads .section-title');if(!bar)return;const b=document.createElement('button');b.id='invoiceSelectedBtn';b.className='primary-btn';b.textContent='Invoice selected';b.style.marginTop='10px';b.onclick=invoiceSelected;bar.appendChild(b)}
async function carrierEmail(carrier){const r=await sb.from('carriers').select('email').eq('name',carrier).maybeSingle();return r.data?.email||''}
function modal(ctx){
 let m=document.getElementById('ziModal');
 if(!m){m=document.createElement('div');m.id='ziModal';m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px';document.body.appendChild(m)}
 const rows=ctx.items.map(x=>'<p class="muted" style="margin:4px 0">Load # '+esc(x.load_number||'-')+' • '+esc((x.pickup||'')+' to '+(x.delivery||''))+' • '+money(x.__due)+'</p>').join('');
 m.innerHTML='<div class="card" style="width:min(560px,96vw);max-height:88vh;overflow:auto"><div class="section-title"><h2>Invoice '+esc(ctx.invoiceNumber)+'</h2><button class="small-btn" id="ziClose">Close</button></div><p class="muted">'+esc(ctx.carrier)+' • '+ctx.items.length+' load(s)'+(ctx.email?'':' • no carrier email on file')+'</p>'+rows+'<p style="font-weight:800;font-size:18px;margin:10px 0">Total Due: '+money(ctx.total)+'</p><div class="card-actions" style="flex-wrap:wrap"><button class="small-btn" id="ziCopy">Copy email text</button><button class="small-btn" id="ziMark">Mark selected loads as Invoiced</button></div><p class="muted">Invoice record is saved. Copy the email text and paste it in Gmail app. Printable PDF will be cleaned in the next patch.</p></div>';
 m.querySelector('#ziClose').onclick=()=>m.remove();
 m.querySelector('#ziCopy').onclick=async()=>{const text='Subject: '+ctx.subject+'\n\n'+ctx.body;try{await navigator.clipboard.writeText(text);alert('Email text copied.')}catch{prompt('Copy email text:',text)}};
 m.querySelector('#ziMark').onclick=async()=>{const b=m.querySelector('#ziMark');b.disabled=true;const up=await sb.from('loads').update({status:'Invoiced'}).in('id',ctx.ids);if(up.error){b.disabled=false;return alert(up.error.message)}b.textContent='Marked as Invoiced ✓';qa('.invoice-select:checked').forEach(x=>x.checked=false);if(typeof loadCloud==='function')await loadCloud()};
}
async function invoiceSelected(){
 const ids=qa('.invoice-select:checked').map(x=>x.dataset.id).filter(Boolean);
 if(!ids.length)return alert('Select at least one load.');
 const u=await currentUser();if(!u)return alert('Login again first.');
 const r=await sb.from('loads').select('*').in('id',ids).order('delivery_date',{ascending:true});
 if(r.error)return alert(r.error.message);
 const items=r.data||[];if(!items.length)return alert('No loads found.');
 if(items.some(x=>!ok(x.status)))return alert('Only Delivered, Invoiced, or Paid loads can be invoiced.');
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
 const il=await sb.from('invoice_loads').insert(items.map(x=>({invoice_id:inv.data.id,load_id:x.id,amount_due:x.__due})));
 if(il.error)return alert(il.error.message);
 const email=await carrierEmail(carrier);
 const lineText=items.map(x=>'Load # '+(x.load_number||'-')+' | '+(x.pickup||'')+' to '+(x.delivery||'')+' | Dispatch fee: '+money(x.__due)).join('\n');
 const subject='Invoice '+invoiceNumber+' - '+carrier;
 const body='Hello,\n\nPlease see invoice details below. I will attach the PDF invoice before sending.\n\nInvoice: '+invoiceNumber+'\nCarrier: '+carrier+'\n\n'+lineText+'\n\nTotal Due: '+money(total)+'\n\nPayment Info:\n'+(st.zelle_info||'')+'\n\nThank you,\n'+(st.company_name||'Zap Dispatch');
 modal({ids,items,carrier,email,total,invoiceNumber,subject,body});
}
setInterval(()=>{addTop()},1500);
})();
