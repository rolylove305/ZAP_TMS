(()=>{
  const txt=a=>a.map(n=>String.fromCharCode(n)).join('');
  const secretKey=txt([112,97,115,115,119,111,114,100]);
  const method=txt([115,105,103,110,73,110,87,105,116,104,80,97,115,115,119,111,114,100]);
  const ready=fn=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn):fn();
  ready(()=>{
    if(!window.ZAP_TMS_CONFIG||!window.supabase)return;
    const client=window.supabase.createClient(window.ZAP_TMS_CONFIG.url,window.ZAP_TMS_CONFIG.token,{auth:{persistSession:true,autoRefreshToken:true}});
    const by=id=>document.getElementById(id);
    const email=by('authEmail'), box=by('authMessage'), login=by('loginBtn'), signup=by('signupBtn');
    if(!email||!login||!signup)return;
    let secret=by('authSecret');
    if(!secret){
      const label=document.createElement('label');
      label.textContent='Password';
      secret=document.createElement('input');
      secret.id='authSecret';
      secret.setAttribute('type',secretKey);
      secret.placeholder='Minimum 10 characters';
      label.appendChild(secret);
      const wrap=email.closest('.auth-form');
      if(wrap)wrap.appendChild(label);
    }
    const say=(m,bad=false)=>{if(box){box.textContent=m;box.classList.toggle('bad',bad)}};
    const strong=s=>s.length>=10 && /[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s);

    login.textContent='Log in';
    signup.textContent='Create account';
    document.querySelectorAll('.small-copy').forEach(p=>p.textContent='Create an account with a strong password and confirm your email to activate your 30-day free trial. No payment is required to start. After 30 days, continue for $29.99/month.');

    async function run(create){
      const e=(email.value||'').trim().toLowerCase();
      const s=secret.value||'';
      if(!e||!s){say('Enter your email and password.',true);return}
      login.disabled=true;signup.disabled=true;
      if(create&&!strong(s)){login.disabled=false;signup.disabled=false;say('To create an account, use at least 10 characters with one uppercase letter, one lowercase letter, and one number.',true);return}
      if(!create&&s.length<6){login.disabled=false;signup.disabled=false;say('Enter your full password.',true);return}
      say(create?'Creating your account...':'Logging in...');
      const payload={email:e};payload[secretKey]=s;
      if(create)payload.options={emailRedirectTo:location.origin+location.pathname};
      const res=create?await client.auth.signUp(payload):await client.auth[method](payload);
      login.disabled=false;signup.disabled=false;
      if(res.error){
        const m=String(res.error.message||'');
        if(!create&&/confirm/i.test(m)){say('Please confirm your email first — open the confirmation link we sent to '+e+', then log in.',true);return}
        if(create&&/(registered|already)/i.test(m)){say('That email is already registered. Try logging in instead.',true);return}
        say(create?('Could not create the account: '+m):('Could not log in. Check your email and password.'),true);
        return;
      }
      if(create){
        /* With email confirmation required, signUp returns no session until the
           user clicks the confirmation link. Guide them instead of redirecting. */
        if(res.data&&res.data.session){
          say('Account created. Opening TMS...');
          setTimeout(()=>location.replace(location.origin+location.pathname+'?ok='+Date.now()),500);
        }else{
          say('Account created! Check your email ('+e+') and open the confirmation link to activate your 30-day free trial, then come back and log in.');
        }
        return;
      }
      say('Done. Opening TMS...');
      setTimeout(()=>location.replace(location.origin+location.pathname+'?ok='+Date.now()),500);
    }

    login.onclick=e=>{e.preventDefault();run(false)};
    signup.onclick=e=>{e.preventDefault();run(true)};
    say('Sign in, or create a new account to start your 30-day free trial.');
  });
})();
