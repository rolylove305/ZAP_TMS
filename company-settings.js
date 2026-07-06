(()=>{
const q=s=>document.querySelector(s);
const val=id=>document.getElementById(id)?.value||'';
const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??''};
async function user(){return (await sb.auth.getSession()).data.session?.user}
async function loadSettings(){const u=await user();if(!u)return;let r=await sb.from('company_settings').select('*').eq('user_id',u.id).maybeSingle();if(r.error){console.warn(r.error);return}if(!r.data){await sb.from('company_settings').insert({user_id:u.id,company_name:'Zap Dispatch',default_commission_pct:8,invoice_footer:'Thank you for your business.'});r=await sb.from('company_settings').select('*').eq('user_id',u.id).maybeSingle()}const x=r.data||{};set('csCompany',x.company_name||'Zap Dispatch');set('csLogo',x.logo_url||'');set('csEmail',x.email||'');set('csPhone',x.phone||'');set('csZelle',x.zelle_info||'');set('csPct',x.default_commission_pct||8);set('csFooter',x.invoice_footer||'Thank you for your business.');}
async function saveSettings(){const u=await user();if(!u)return alert('Login again first.');const row={user_id:u.id,company_name:val('csCompany')||'Zap Dispatch',logo_url:val('csLogo'),email:val('csEmail'),phone:val('csPhone'),zelle_info:val('csZelle'),default_commission_pct:Number(val('csPct')||8),invoice_footer:val('csFooter')||'Thank you for your business.',updated_at:new Date().toISOString()};const r=await sb.from('company_settings').upsert(row,{onConflict:'user_id'});if(r.error)return alert(r.error.message);alert('Company settings saved.');}
function panel(){if(q('#companySettingsCard'))return;const first=q('main')||document.body;const card=document.createElement('section');card.id='companySettingsCard';card.className='card';card.style.margin='0 0 14px';card.innerHTML=`
  <div class="section-title"><h2>Company Settings</h2><span>Invoice profile</span></div>
  <div class="grid-2">
    <label>Company name<input id="csCompany" placeholder="Zap Dispatch"></label>
    <label>Logo URL optional<input id="csLogo" placeholder="https://..."></label>
    <label>Email<input id="csEmail" placeholder="dispatch@zapdispatch.com"></label>
    <label>Phone<input id="csPhone" placeholder="(000) 000-0000"></label>
    <label>Zelle / payment info<input id="csZelle" placeholder="Zelle: dispatch@zapdispatch.com"></label>
    <label>Default dispatcher %<input id="csPct" type="number" placeholder="8"></label>
  </div>
  <label>Invoice footer<textarea id="csFooter" rows="2" placeholder="Thank you for your business."></textarea></label>
  <button id="saveCompanySettings" class="primary-btn">Save Company Settings</button>
  <p class="muted">These details will appear on your invoices.</p>`;
first.prepend(card);q('#saveCompanySettings').onclick=saveSettings;loadSettings();}
setTimeout(panel,1200);
})();