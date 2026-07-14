(()=>{
  /* Admin panel: lists all profiles and lets an admin deactivate/reactivate
     users. Isolated overlay. Security is enforced server-side by RLS
     (profiles: read own-or-admin, update admin-only + has_access checks
     is_active); this only shows the UI when the logged-in user is an admin.
     Deactivating a user immediately blocks their access to all TMS data. */

  let checked=false, isAdmin=false;

  function esc2(v){return String(v==null?'':v).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
  function fmtDate(d){return d?String(d).slice(0,10):''}

  async function sessionUserId(){
    try{const s=(await sb.auth.getSession()).data.session;return s?s.user.id:null}catch(e){return null}
  }

  async function amIAdmin(uid){
    try{
      const r=await sb.from('profiles').select('role').eq('id',uid).single();
      return !r.error && r.data && r.data.role==='admin';
    }catch(e){return false}
  }

  async function renderList(body){
    const meId=await sessionUserId();
    const r=await sb.from('profiles')
      .select('id,email,role,is_active,subscription_status,trial_ends_at,created_at')
      .order('created_at',{ascending:true});
    if(r.error){body.innerHTML='<p class="muted">Could not load users: '+esc2(r.error.message)+'</p>';return}
    const rows=r.data||[];
    let html='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'
      +'<thead><tr style="text-align:left;border-bottom:1px solid rgba(255,255,255,.18)">'
      +'<th style="padding:8px 6px">Email</th><th>Role</th><th>Status</th><th>Subscription</th><th>Trial ends</th><th>Joined</th><th></th></tr></thead><tbody>';
    rows.forEach(u=>{
      const isMe=u.id===meId;
      const badge=u.is_active?'<span class="pill green">Active</span>':'<span class="pill red">Disabled</span>';
      const btn=isMe
        ?'<span class="muted" style="font-size:12px">(you)</span>'
        :'<button class="small-btn zau-toggle" data-id="'+esc2(u.id)+'" data-active="'+(u.is_active?'1':'0')+'">'+(u.is_active?'Deactivate':'Reactivate')+'</button>';
      html+='<tr style="border-bottom:1px solid rgba(255,255,255,.07)">'
        +'<td style="padding:8px 6px">'+esc2(u.email)+'</td>'
        +'<td>'+esc2(u.role)+'</td><td>'+badge+'</td>'
        +'<td>'+esc2(u.subscription_status)+'</td>'
        +'<td>'+fmtDate(u.trial_ends_at)+'</td>'
        +'<td>'+fmtDate(u.created_at)+'</td>'
        +'<td>'+btn+'</td></tr>';
    });
    html+='</tbody></table></div><p class="muted" style="margin-top:10px;font-size:12px">'
      +rows.length+' user(s). Deactivating a user immediately blocks their access to all TMS data (enforced server-side).</p>';
    body.innerHTML=html;
    body.querySelectorAll('.zau-toggle').forEach(b=>{
      b.onclick=async()=>{
        const id=b.dataset.id, cur=b.dataset.active==='1';
        if(!confirm(cur?'Deactivate this user? They lose access to the TMS immediately.':'Reactivate this user?'))return;
        b.disabled=true;b.textContent='…';
        const up=await sb.from('profiles').update({is_active:!cur}).eq('id',id).select().single();
        if(up.error){alert('Update failed: '+up.error.message);b.disabled=false;b.textContent=cur?'Deactivate':'Reactivate';return}
        await renderList(body);
      };
    });
  }

  async function openPanel(){
    let modal=document.getElementById('zapAdminModal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='zapAdminModal';
      modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:10000;display:flex;align-items:center;justify-content:center;padding:18px';
      document.body.appendChild(modal);
    }
    modal.innerHTML='<div class="card" style="width:min(940px,97vw);max-height:90vh;overflow:auto"><div class="section-title"><h2>Admin — Users</h2><button class="small-btn" id="zauClose">Close</button></div><div id="zauBody"><p class="muted">Loading users…</p></div></div>';
    modal.querySelector('#zauClose').onclick=()=>modal.remove();
    await renderList(modal.querySelector('#zauBody'));
  }

  function injectButton(){
    if(document.getElementById('zapAdminBtn'))return;
    const actions=document.querySelector('.top-actions');
    if(!actions)return;
    const btn=document.createElement('button');
    btn.id='zapAdminBtn';
    btn.className='small-btn';
    btn.textContent='Admin';
    btn.onclick=openPanel;
    actions.insertBefore(btn,actions.firstChild);
  }

  async function tick(){
    if(typeof sb==='undefined'||!sb)return;
    const uid=await sessionUserId();
    if(!uid){checked=false;isAdmin=false;return}
    if(!checked){isAdmin=await amIAdmin(uid);checked=true;}
    if(isAdmin)injectButton();
  }

  setInterval(tick,2000);
  tick();
})();
