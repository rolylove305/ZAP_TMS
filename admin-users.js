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
      .select('id,email,role,account_type,is_active,comp_access,subscription_status,trial_ends_at,created_at')
      .order('created_at',{ascending:true});
    if(r.error){body.innerHTML='<p class="muted">Could not load users: '+esc2(r.error.message)+'</p>';return}
    const rows=r.data||[];
    let html='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'
      +'<thead><tr style="text-align:left;border-bottom:1px solid rgba(255,255,255,.18)">'
      +'<th style="padding:8px 6px">Email</th><th>Account</th><th>Role</th><th>Status</th><th>Free access</th><th>Subscription</th><th>Trial ends</th><th>Joined</th><th></th></tr></thead><tbody>';
    rows.forEach(u=>{
      const isMe=u.id===meId;
      const badge=u.is_active?'<span class="pill green">Active</span>':'<span class="pill red">Disabled</span>';
      const comp=u.comp_access?'<span class="pill green">Free</span>':'<span class="muted" style="font-size:12px">—</span>';
      let actions;
      if(isMe){
        actions='<span class="muted" style="font-size:12px">(you)</span>';
      }else{
        actions='<button class="small-btn zau-comp" data-id="'+esc2(u.id)+'" data-comp="'+(u.comp_access?'1':'0')+'">'+(u.comp_access?'Remove free':'Grant free')+'</button>'
          +' <button class="small-btn zau-toggle" data-id="'+esc2(u.id)+'" data-active="'+(u.is_active?'1':'0')+'">'+(u.is_active?'Deactivate':'Reactivate')+'</button>';
      }
      html+='<tr style="border-bottom:1px solid rgba(255,255,255,.07)">'
        +'<td style="padding:8px 6px">'+esc2(u.email)+'</td>'
        +'<td><select class="zau-type" data-id="'+esc2(u.id)+'" '+(isMe?'disabled':'')+' style="min-width:112px;padding:7px"><option value="dispatcher" '+(u.account_type==='carrier'?'':'selected')+'>Dispatcher</option><option value="carrier" '+(u.account_type==='carrier'?'selected':'')+'>Carrier</option></select></td>'
        +'<td>'+esc2(u.role)+'</td><td>'+badge+'</td>'
        +'<td>'+comp+'</td>'
        +'<td>'+esc2(u.subscription_status)+'</td>'
        +'<td>'+fmtDate(u.trial_ends_at)+'</td>'
        +'<td>'+fmtDate(u.created_at)+'</td>'
        +'<td style="white-space:nowrap">'+actions+'</td></tr>';
    });
    html+='</tbody></table></div><p class="muted" style="margin-top:10px;font-size:12px">'
      +rows.length+' user(s). "Grant free" gives complimentary access (no charge). Deactivating blocks a user\'s access immediately. All enforced server-side.</p>';
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
    body.querySelectorAll('.zau-type').forEach(select=>{
      select.onchange=async()=>{
        const next=select.value==='carrier'?'carrier':'dispatcher';
        if(!confirm('Change this user to a '+next+' account? Their data stays private; only their TMS tools and navigation change.')){await renderList(body);return}
        select.disabled=true;
        const up=await sb.from('profiles').update({account_type:next}).eq('id',select.dataset.id).select().single();
        if(up.error){alert('Update failed: '+up.error.message);await renderList(body);return}
        await renderList(body);
      };
    });
    body.querySelectorAll('.zau-comp').forEach(b=>{
      b.onclick=async()=>{
        const id=b.dataset.id, cur=b.dataset.comp==='1';
        if(!confirm(cur?'Remove free access from this user? They will need a subscription (or valid trial) to keep using the TMS.':'Grant free (complimentary) access to this user? They will not be charged.'))return;
        b.disabled=true;b.textContent='…';
        const up=await sb.from('profiles').update({comp_access:!cur}).eq('id',id).select().single();
        if(up.error){alert('Update failed: '+up.error.message);b.disabled=false;b.textContent=cur?'Remove free':'Grant free';return}
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
    modal.innerHTML='<div class="card" style="width:min(940px,97vw);max-height:90vh;overflow:auto">'
      +'<div class="section-title"><h2>Admin — Users</h2><button class="small-btn" id="zauClose">Close</button></div>'
      +'<h3 style="margin:4px 0 6px;font-size:15px">Free-access invites</h3>'
      +'<div id="zciBody"><p class="muted">Loading…</p></div>'
      +'<h3 style="margin:18px 0 6px;font-size:15px">Users</h3>'
      +'<div id="zauBody"><p class="muted">Loading users…</p></div>'
      +'</div>';
    modal.querySelector('#zauClose').onclick=()=>modal.remove();
    await renderInvites(modal.querySelector('#zciBody'));
    await renderList(modal.querySelector('#zauBody'));
  }

  async function renderInvites(box){
    const r=await sb.from('comp_invites').select('email,created_at').order('created_at',{ascending:false});
    const rows=(r&&!r.error&&r.data)?r.data:[];
    const list=rows.length
      ? rows.map(x=>'<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.07)"><span>'+esc2(x.email)+'</span><button class="small-btn zci-del" data-email="'+esc2(x.email)+'">Remove</button></div>').join('')
      : '<p class="muted" style="font-size:12px">No free-access invites yet.</p>';
    box.innerHTML='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><input id="zciEmail" type="email" placeholder="person@email.com" style="flex:1;min-width:240px"><button class="small-btn" id="zciAdd">Add free invite</button></div>'
      +'<div>'+list+'</div>'
      +'<p class="muted" style="font-size:11px;margin-top:6px">Invited emails get free access automatically when they sign up (just share app.zapdispatch.com — no payment required for them).</p>';
    box.querySelector('#zciAdd').onclick=async()=>{
      const inp=box.querySelector('#zciEmail');
      const email=(inp.value||'').trim().toLowerCase();
      if(!email||email.indexOf('@')<1){alert('Enter a valid email.');return}
      const meId=await sessionUserId();
      const up=await sb.from('comp_invites').upsert({email:email,invited_by:meId},{onConflict:'email'});
      if(up.error){alert('Could not add invite: '+up.error.message);return}
      inp.value='';
      await renderInvites(box);
    };
    box.querySelectorAll('.zci-del').forEach(b=>{
      b.onclick=async()=>{
        const email=b.dataset.email;
        if(!confirm('Remove the free-access invite for '+email+'?\n(If they already signed up, their access stays — use "Remove free" on their row to revoke it.)'))return;
        const d=await sb.from('comp_invites').delete().eq('email',email);
        if(d.error){alert('Could not remove: '+d.error.message);return}
        await renderInvites(box);
      };
    });
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
