(()=>{
function ready(fn){document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn):fn()}
ready(()=>setTimeout(()=>{
 if(!window.ZAP_TMS_CONFIG||!window.supabase)return;
 const client=window.supabase.createClient(window.ZAP_TMS_CONFIG.url,window.ZAP_TMS_CONFIG.token,{auth:{persistSession:true,autoRefreshToken:true}});
 const email=document.getElementById('authEmail'), pass=document.getElementById('authSecret'), msg=document.getElementById('authMessage'), login=document.getElementById('loginBtn'), signup=document.getElementById('signupBtn');
 if(!email||!login||!signup)return;
 const say=(m,bad)=>{if(msg){msg.textContent=m;msg.classList.toggle('bad',!!bad)}};
 const strong=s=>s.length>=10&&/[A-Z]/.test(s)&&/[a-z]/.test(s)&&/[0-9]/.test(s);
 async function invited(e){const r=await client.rpc('is_email_invited',{p_email:e});return !r.error&&r.data===true}
 async function run(create){const e=(email.value||'').trim().toLowerCase(),s=(document.getElementById('authSecret')?.value||'');if(!e||!s)return say('Enter your invited email and password.',true);login.disabled=true;signup.disabled=true;say('Checking invitation...');const ok=await invited(e);if(!ok){login.disabled=false;signup.disabled=false;return say('This email is not invited yet. Ask Zap Dispatch for an invitation.',true)}if(create&&!strong(s)){login.disabled=false;signup.disabled=false;return say('Use at least 10 characters with uppercase, lowercase, and number.',true)}const payload={email:e,password:s};say(create?'Creating invited user...':'Logging in...');const res=create?await client.auth.signUp(payload):await client.auth.signInWithPassword(payload);login.disabled=false;signup.disabled=false;if(res.error)return say(res.error.message,true);say('Done. Opening TMS...');setTimeout(()=>location.replace(location.origin+location.pathname+'?ok='+Date.now()),500)}
 login.onclick=e=>{e.preventDefault();run(false)};
 signup.onclick=e=>{e.preventDefault();run(true)};
 signup.textContent='Create invited user';
 say('Invite-only login is active.');
},900));
})();