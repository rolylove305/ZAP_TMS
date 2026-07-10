(()=>{
/* Step 4E (stabilize-load-board): standalone printable invoice, device-aware.
   Loaded as invoice-print.html?invoice_id=<id>. Reads invoice, invoice_loads
   and the related loads directly from Supabase (relies on the dispatcher's
   existing logged-in session, shared via localStorage since this is
   same-origin with index.html). No document.write, no auto print().
   "Open Gmail draft" only renders on desktop — same iOS Gmail-app encoding
   issue as the modal, so it's hidden entirely on iOS rather than opened. */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const root=document.getElementById("root");
if(!root)return alert('This page failed to load correctly (missing content area). Please reload.');
const esc=v=>String(v??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
const money=n=>"$"+Number(n||0).toFixed(2);

function showState(html){root.innerHTML='<div class="state">'+html+'</div>'}
if(!window.ZAP_TMS_CONFIG)return showState('<p class="muted">Configuration failed to load. Please reload this page. If the problem continues, contact support.</p>');
if(!window.supabase||typeof window.supabase.createClient!=='function')return showState('<p class="muted">Could not load required libraries. Check your connection and reload this page.</p>');
const cfg=window.ZAP_TMS_CONFIG;
const sb=window.supabase.createClient(cfg.url,cfg.token);

function gmailUrl(to,subject,body){return 'https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(to||'')+'&su='+encodeURIComponent(subject||'')+'&body='+encodeURIComponent(body||'')}

async function carrierEmail(carrier){
  const r=await sb.from('carriers').select('email').eq('name',carrier).maybeSingle();
  return r.data?.email||'';
}

async function companySettings(userId){
  const r=await sb.from('company_settings').select('*').eq('user_id',userId).maybeSingle();
  if(r.error)return {};
  return r.data||{company_name:'Zap Dispatch',invoice_footer:'Thank you for your business.'};
}

function render(ctx){
  const rows=ctx.rows.map(r=>
    '<tr><td>'+esc(r.loadNumber)+'</td><td>'+esc(r.lane)+'</td><td>'+esc(r.date)+'</td><td>'+money(r.rate)+'</td><td>'+esc(r.pctLabel)+'</td><td>'+money(r.due)+'</td></tr>'
  ).join('');
  const grossTotal=ctx.rows.reduce((sum,r)=>sum+Number(r.rate||0),0);
  const logo=ctx.st.logo_url?'<img src="'+esc(ctx.st.logo_url)+'" style="max-height:65px;max-width:180px;margin-bottom:10px">':'';
  const contact=[ctx.st.email,ctx.st.phone].filter(Boolean).map(esc).join('<br>');
  const pay=ctx.st.zelle_info?esc(ctx.st.zelle_info):'Zelle payment details not set.';
  document.title='Invoice '+(ctx.invoice.invoice_number||'')+' - '+(ctx.invoice.carrier||'');
  root.innerHTML=
    '<div class="actions">'
      +'<button class="btn" id="ipPrint">Print / Save as PDF</button>'
      +(isIOS?'':'<a class="btn btn2" id="ipGmail" href="'+esc(ctx.gUrl)+'" target="_blank" rel="noopener">Open Gmail draft</a>')
    +'</div>'
    +'<div class="top"><div>'+logo+'<h1>'+esc(ctx.st.company_name||'Zap Dispatch')+'</h1><p class="muted">'+contact+'</p></div>'
      +'<div><h2>INVOICE</h2><b>Invoice #:</b> '+esc(ctx.invoice.invoice_number||'-')+'<br>'
      +'<b>Date:</b> '+(ctx.invoice.created_at?new Date(ctx.invoice.created_at).toLocaleDateString():new Date().toLocaleDateString())+'<br>'
      +'<b>Carrier:</b> '+esc(ctx.invoice.carrier||'-')+'</div></div>'
    +'<table><thead><tr><th>Load #</th><th>Lane</th><th>Date</th><th>Rate</th><th>Dispatch %</th><th>Amount Due</th></tr></thead><tbody>'+rows+'</tbody></table>'
    +'<div class="total" style="font-size:18px">Total Load Rates: '+money(grossTotal)+'</div>'
    +'<div class="total">Total Due: '+money(ctx.invoice.total)+'</div>'
    +'<div class="pay"><b>Payment Info:</b><br>'+pay+'</div>'
    +'<p class="muted">'+esc(ctx.st.invoice_footer||'Thank you for your business.')+'</p>';
  /* user-tap only: never called automatically */
  document.getElementById('ipPrint').onclick=()=>window.print();
}

async function main(){
  const id=new URLSearchParams(location.search).get('invoice_id');
  if(!id)return showState('<p class="muted">Missing invoice_id in the URL.</p>');

  const session=(await sb.auth.getSession()).data.session;
  if(!session){
    return showState('<p class="muted">You need to be logged in to view this invoice.</p><p class="state-actions"><a class="btn" href="index.html">Go to Zap Dispatch TMS</a></p>');
  }

  const invR=await sb.from('invoices').select('*').eq('id',id).maybeSingle();
  if(invR.error)return showState('<p class="muted">Could not load invoice: '+esc(invR.error.message)+'</p>');
  if(!invR.data)return showState('<p class="muted">Invoice not found, or you do not have access to it.</p><p class="state-actions"><a class="btn" href="index.html">Go to Zap Dispatch TMS</a></p>');
  const invoice=invR.data;

  const ilR=await sb.from('invoice_loads').select('load_id,amount_due').eq('invoice_id',id);
  if(ilR.error)return showState('<p class="muted">Could not load invoice lines: '+esc(ilR.error.message)+'</p>');
  const invoiceLoads=ilR.data||[];
  const loadIds=invoiceLoads.map(x=>x.load_id).filter(Boolean);

  let loads=[];
  if(loadIds.length){
    const lR=await sb.from('loads').select('*').in('id',loadIds);
    if(lR.error)return showState('<p class="muted">Could not load load details: '+esc(lR.error.message)+'</p>');
    loads=lR.data||[];
  }
  const byId={};loads.forEach(l=>{byId[l.id]=l});

  const rows=invoiceLoads.map(il=>{
    const l=byId[il.load_id]||{};
    const rate=Number(l.rate||0);
    const due=Number(il.amount_due||0);
    const pct=rate>0?((due/rate)*100).toFixed(1).replace(/\.0$/,'')+'%':'-';
    return {
      loadNumber:l.load_number||'-',
      lane:(l.pickup||'')+' → '+(l.delivery||''),
      date:l.delivery_date||l.pickup_date||'',
      rate,pctLabel:pct,due
    };
  }).sort((a,b)=>String(a.date).localeCompare(String(b.date)));

  const st=await companySettings(invoice.user_id);
  const email=await carrierEmail(invoice.carrier);
  const grossTotal=rows.reduce((sum,r)=>sum+Number(r.rate||0),0);
  const lineText=rows.map(r=>'Load # '+r.loadNumber+' | '+r.lane+' | Rate: '+money(r.rate)+' | Dispatch fee: '+money(r.due)).join('\n');
  const subject='Invoice '+(invoice.invoice_number||'')+' - '+(invoice.carrier||'');
  const body='Hello,\n\nPlease see invoice details below. I will attach the PDF invoice before sending.\n\nInvoice: '+(invoice.invoice_number||'')+'\nCarrier: '+(invoice.carrier||'')+'\n\n'+lineText+'\n\nTotal Load Rates: '+money(grossTotal)+'\nTotal Due: '+money(invoice.total)+'\n\nPayment Info:\n'+(st.zelle_info||'')+'\n\nThank you,\n'+(st.company_name||'Zap Dispatch');
  const gUrl=gmailUrl(email,subject,body);

  render({invoice,rows,st,gUrl});
}

main().catch(e=>showState('<p class="muted">Unexpected error: '+esc(e.message||String(e))+'</p>'));
})();
