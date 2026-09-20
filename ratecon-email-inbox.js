(()=>{
const by=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
let code=null;

async function ensureCode(){
  if(code)return code;
  const r=await sb.rpc("get_or_create_ratecon_inbox_code");
  if(r.error){console.warn("ratecon inbox code error",r.error);return null}
  code=r.data;
  return code;
}

async function render(){
  const settings=by("settings");
  if(!settings||by("raceconInboxCard"))return;
  const card=document.createElement("div");
  card.className="card";
  card.id="raceconInboxCard";
  card.innerHTML='<h2>📧 Create loads from email</h2><p class="muted">Forward a broker\'s Rate Con PDF to your dedicated address below and a load is created automatically — review it in the Load Board.</p><p class="muted" id="raceconInboxStatus">Loading your address…</p>';
  const settingsHeader=settings.querySelector(".section-title");
  if(settingsHeader)settingsHeader.after(card);else settings.prepend(card);
  const value=await ensureCode();
  const status=by("raceconInboxStatus");
  if(!status)return;
  if(!value){status.textContent="Could not load your inbox address. Try refreshing.";return}
  const address=value+"@loads.zapdispatch.com";
  status.outerHTML='<div style="margin-top:10px"><input id="raceconInboxAddress" readonly value="'+esc(address)+'" style="width:100%;font-weight:800;color:var(--green)"><div class="card-actions" style="margin-top:8px"><button class="small-btn" id="raceconInboxCopy">Copy address</button></div><p class="muted" style="margin-top:10px;font-size:12px">In Gmail: Settings → Forwarding and POP/IMAP → Add a forwarding address → paste this in, confirm it, then create a filter to auto-forward Rate Cons here. Only PDF attachments are processed.</p></div>';
  const copyBtn=by("raceconInboxCopy");
  if(copyBtn)copyBtn.onclick=async()=>{
    try{await navigator.clipboard.writeText(address);copyBtn.textContent="Copied ✓";setTimeout(()=>copyBtn.textContent="Copy address",1500)}
    catch{const inp=by("raceconInboxAddress");if(inp){inp.select();document.execCommand("copy");copyBtn.textContent="Copied ✓";setTimeout(()=>copyBtn.textContent="Copy address",1500)}}
  };
}

function boot(){
  if(typeof accountType!=="undefined"&&accountType!=="dispatcher")return;
  render();
}
setInterval(boot,1500);
})();
