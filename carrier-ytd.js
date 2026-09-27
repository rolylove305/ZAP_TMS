((root,factory)=>{
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root&&root.document){root.ZapCarrierYtd=api;api.install(root)}
})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const number=value=>{
    const parsed=Number(value);
    return Number.isFinite(parsed)?parsed:0;
  };
  const normalize=value=>String(value??'').trim().toLocaleLowerCase();

  function aggregate(rows,year){
    const groups=new Map();
    (rows||[]).forEach(row=>{
      if(!row||!row.invoiced_at)return;
      const invoicedAt=new Date(row.invoiced_at);
      if(Number.isNaN(invoicedAt.getTime())||invoicedAt.getFullYear()!==year)return;
      const name=String(row.carrier||'').trim()||'Unassigned carrier';
      const key=row.carrier_id?`id:${row.carrier_id}`:`name:${normalize(name)}`;
      const gross=number(row.rate);
      const pct=number(row.commission_pct);
      const current=groups.get(key)||{key,carrier:name,earnings:0,gross:0,billedLoads:0};
      current.earnings+=gross*pct/100;
      current.gross+=gross;
      current.billedLoads+=1;
      groups.set(key,current);
    });
    return [...groups.values()]
      .map(group=>({...group,earnings:Number(group.earnings.toFixed(2)),gross:Number(group.gross.toFixed(2))}))
      .sort((a,b)=>b.earnings-a.earnings||a.carrier.localeCompare(b.carrier));
  }

  function summaryForInvoice(rows,carrier,invoiceDate){
    const asOf=new Date(invoiceDate);
    if(Number.isNaN(asOf.getTime()))return {earnings:0,gross:0,billedLoads:0,year:null};
    const year=asOf.getFullYear();
    const cutoff=new Date(year,asOf.getMonth(),asOf.getDate()+1).getTime();
    const carrierKey=normalize(carrier);
    const eligible=(rows||[]).filter(row=>{
      const invoicedAt=new Date(row&&row.invoiced_at);
      return normalize(row&&row.carrier)===carrierKey
        && !Number.isNaN(invoicedAt.getTime())
        && invoicedAt.getFullYear()===year
        && invoicedAt.getTime()<cutoff;
    });
    const summary=aggregate(eligible,year).reduce((total,row)=>({
      earnings:total.earnings+row.earnings,
      gross:total.gross+row.gross,
      billedLoads:total.billedLoads+row.billedLoads
    }),{earnings:0,gross:0,billedLoads:0});
    return {...summary,earnings:Number(summary.earnings.toFixed(2)),gross:Number(summary.gross.toFixed(2)),year};
  }

  function install(win){
    const doc=win.document;
    const esc=value=>String(value??'').replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
    const money=value=>'$'+number(value).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
    let requestId=0;

    async function fetchYearRows(year){
      const start=new Date(year,0,1).toISOString();
      const end=new Date(year+1,0,1).toISOString();
      const pageSize=1000;
      const rows=[];
      for(let from=0;;from+=pageSize){
        const response=await win.sb.from('loads')
          .select('id,carrier_id,carrier,rate,commission_pct,invoiced_at,paid_at,status')
          .gte('invoiced_at',start)
          .lt('invoiced_at',end)
          .order('id',{ascending:true})
          .range(from,from+pageSize-1);
        if(response.error)throw new Error(response.error.message);
        const page=response.data||[];
        rows.push(...page);
        if(page.length<pageSize)break;
      }
      return rows;
    }

    async function render(force=false){
      const list=doc.getElementById('carrierYtdEarningsList');
      const subtitle=doc.getElementById('carrierYtdEarningsSubtitle');
      if(!list)return;
      if(!force&&list.dataset.loaded==='true')return;
      const activeRequest=++requestId;
      const year=new Date().getFullYear();
      subtitle.textContent=`Carrier gross and dispatch earnings from Invoiced and Paid loads for ${year}. Existing billed loads are included automatically.`;
      if(typeof win.sb==='undefined'){
        list.innerHTML="<div class='card'><p class='muted'>YTD earnings could not load yet.</p></div>";
        return;
      }
      list.dataset.loaded='false';
      list.innerHTML="<div class='card'><p class='muted'>Loading YTD earnings…</p></div>";
      try{
        const rows=aggregate(await fetchYearRows(year),year);
        if(activeRequest!==requestId)return;
        if(!rows.length){
          list.innerHTML="<div class='card'><p class='muted'>No invoiced or paid loads recorded for this year yet.</p></div>";
          list.dataset.loaded='true';
          return;
        }
        list.innerHTML=rows.map(row=>
          '<div class="metric-card">'
            +'<p>'+esc(row.carrier)+'</p>'
            +'<h2>'+money(row.gross)+'</h2>'
            +'<p class="muted" style="margin:2px 0 0">Carrier gross YTD</p>'
            +'<div class="pill-row" style="margin-top:8px">'
              +'<span class="pill green">'+row.billedLoads+' billed load'+(row.billedLoads===1?'':'s')+'</span>'
              +'<span class="pill">Dispatch fee YTD '+money(row.earnings)+'</span>'
            +'</div>'
          +'</div>'
        ).join('');
        list.dataset.loaded='true';
      }catch(error){
        if(activeRequest!==requestId)return;
        list.innerHTML='<div class="card"><p class="muted">Could not load YTD earnings: '+esc(error.message||String(error))+'</p></div>';
      }
    }

    doc.addEventListener('click',event=>{
      if(event.target.closest('[data-screen="invoices"]'))setTimeout(()=>render(true),50);
    });
    setTimeout(()=>{
      if(doc.querySelector('#invoices.screen.active'))render(true);
    },1200);
    win.renderCarrierYtdEarnings=render;
  }

  return {aggregate,summaryForInvoice,install};
});
