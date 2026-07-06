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
      label.textContent='Clave';
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
    login.textContent='Login con clave';
    signup.textContent='Crear usuario con clave';
    document.querySelectorAll('.small-copy').forEach(p=>p.textContent='Usa una clave fuerte: mínimo 10 caracteres, mayúscula, minúscula y número.');
    async function run(create){
      const e=(email.value||'').trim();
      const s=secret.value||'';
      if(!e||!s){say('Escribe email y clave.',true);return}
      if(create&&!strong(s)){say('Para crear usuario usa mínimo 10 caracteres con mayúscula, minúscula y número.',true);return}
      if(!create&&s.length<6){say('Escribe tu clave completa.',true);return}
      login.disabled=true;signup.disabled=true;say(create?'Creando usuario...':'Entrando...');
      const payload={email:e};payload[secretKey]=s;
      const res=create?await client.auth.signUp(payload):await client.auth[method](payload);
      login.disabled=false;signup.disabled=false;
      if(res.error){say(create?'No se pudo crear el usuario. Revisa email y clave.':'No se pudo entrar. Revisa email y clave.',true);return}
      say('Listo. Abriendo TMS...');
      setTimeout(()=>location.replace(location.origin+location.pathname+'?ok='+Date.now()),500);
    }
    login.onclick=e=>{e.preventDefault();run(false)};
    signup.onclick=e=>{e.preventDefault();run(true)};
    say('Login por email + clave activado.');
  });
})();