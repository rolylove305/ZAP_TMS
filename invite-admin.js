(()=>{
const OWNER='rolando@zapdispatch.com';
const q=s=>document.querySelector(s);
async function me(){return (await sb.auth.getSession()).data.session?.user||null}
const escI=v=>String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
async function toggleInvite(email,active,box){if(active&&!confirm('Turn off access for '+email+'? They will not be able to log in until turned back on.'))return;const r=await sb.from('app_invites').update({active:!active}).eq('email',email);if(r.error)return alert(r.error.message);loadInvites(box)}
async function loadInvites(box){
  const r=await sb.from('app_invites').select('email,active,created_at,note').order('created_at',{ascending:false});
  if(r.error){box.textContent=r.error.message;return}
  const inv=r.data||[];
  if(!inv.length){box.innerHTML='<p class="muted">No invites yet.</p>';return}
  box.innerHTML='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
    +'<select id="inviteSelect" style="flex:1;min-width:220px">'+inv.map((x,i)=>`<option value="${i}">${escI(x.email)} — ${x.active?'Active':'Off'}</option>`).join('')+'</select>'
    +'<button type="button" class="small-btn" id="inviteToggleBtn"></button>'
    +'</div>';
  const sel=box.querySelector('#inviteSelect'),btn=box.querySelector('#inviteToggleBtn');
  const sync=()=>{const x=inv[+sel.value];const isOwner=String(x.email).toLowerCase()===OWNER;btn.textContent=x.active?'Turn off':'Turn on';btn.disabled=isOwner;btn.title=isOwner?'The owner account cannot be turned off':''};
  sel.onchange=sync;sync();
  btn.onclick=()=>{const x=inv[+sel.value];toggleInvite(x.email,x.active,box)};
}
async function addInvite(input,box){const u=await me();const email=(input.value||'').trim().toLowerCase();if(!email)return alert('Enter an email.');const r=await sb.from('app_invites').upsert({email,active:true,invited_by:u.id,note:'beta tester'},{onConflict:'email'});if(r.error)return alert(r.error.message);input.value='';alert('Invite added: '+email);loadInvites(box)}
async function panel(){if(!window.sb)return;const u=await me();if(!u||String(u.email||'').toLowerCase()!==OWNER)return;if(q('#invitePanel'))return;const host=q('#companySettingsCard')||q('#zapDash')||document.body;const div=document.createElement('section');div.id='invitePanel';div.className='card';div.style.margin='0 0 14px';div.innerHTML=`<div class="section-title"><h2>Invite Users</h2><p class="muted">Only invited emails can create/use an account.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="inviteEmail" placeholder="dispatcher@email.com" style="flex:1;min-width:240px"><button class="small-btn" id="addInviteBtn">Add Invite</button></div><div id="inviteList" style="margin-top:10px"></div>`;host.after(div);const input=q('#inviteEmail'),list=q('#inviteList');q('#addInviteBtn').onclick=()=>addInvite(input,list);loadInvites(list)}
setTimeout(panel,1800);
})();