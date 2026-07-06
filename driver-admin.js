(()=>{
  const getLoads=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return []}};
  async function makeDriverLink(i){
    const loads=getLoads();
    const load=loads[i];
    if(!load||!load.id){alert('Sync the load first, then try again.');return}
    const {data,error}=await sb.rpc('create_driver_link',{p_load_id:load.id});
    if(error){alert('Driver link error: '+error.message);return}
    const base=location.origin+location.pathname.replace(/index\.html$/,'').replace(/\/$/,'/');
    const url=base+'driver.html?t='+data;
    try{await navigator.clipboard.writeText(url);alert('Driver link copied:\n'+url)}catch{prompt('Copy driver link:',url)}
  }
  window.makeDriverLink=makeDriverLink;
  function addButtons(){
    const cards=document.querySelectorAll('#loadsList .list-card');
    cards.forEach((card,i)=>{
      if(card.querySelector('.driver-link-btn'))return;
      let actions=card.querySelector('.card-actions');
      if(!actions){actions=document.createElement('div');actions.className='card-actions';card.appendChild(actions)}
      const btn=document.createElement('button');
      btn.className='small-btn driver-link-btn';
      btn.textContent='Driver Link';
      btn.onclick=()=>makeDriverLink(i);
      actions.insertBefore(btn,actions.firstChild);
    });
  }
  setInterval(addButtons,1200);
  document.addEventListener('click',()=>setTimeout(addButtons,300));
})();