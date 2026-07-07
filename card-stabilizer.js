(()=>{
const getLoads=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
function cardText(card){return (card.textContent||'').replace(/\s+/g,' ').trim()}
function findLoadForCard(card,loads){
  const t=cardText(card).toLowerCase();
  return loads.find(l=>l.id&&card.dataset.loadId===l.id)||loads.find(l=>l.load_number&&t.includes(String(l.load_number).toLowerCase()))||loads.find(l=>l.pickup&&l.delivery&&t.includes(String(l.pickup).toLowerCase())&&t.includes(String(l.delivery).toLowerCase()))||null;
}
function stabilize(){
  const loads=getLoads();
  document.querySelectorAll('#loadsList .list-card').forEach(card=>{
    const l=findLoadForCard(card,loads); if(!l||!l.id)return;
    if(card.dataset.loadId!==l.id){card.dataset.loadId=l.id;}
    card.querySelectorAll('.zap-upload-doc-btn,.zap-manage-docs-btn,.load-link-btn,.load-docs-btn,.load-loc-btn').forEach(b=>{b.dataset.loadId=l.id});
  });
}
setInterval(stabilize,700);
})();