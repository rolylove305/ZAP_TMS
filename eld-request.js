(()=>{
  const by=id=>document.getElementById(id);
  const endpoint=()=>`${window.ZAP_TMS_CONFIG.url}/functions/v1/eld-request`;

  const SUPPORTED_ELDS=[
    {name:"Apollo ELD",status:"available",icon:"✓"},
    {name:"Next Fleet ELD",status:"available",icon:"✓"},
  ];

  const COMING_SOON_ELDS=[
    {name:"Geotab",website:"https://geotab.com",popular:true},
    {name:"Samsara",website:"https://samsara.com",popular:true},
    {name:"Verizon Connect",website:"https://www.verizonconnect.com",popular:true},
    {name:"Omnitracs",website:"https://www.omnitracs.com"},
    {name:"Lytx DriveCam",website:"https://lytx.com"},
    {name:"Wialon",website:"https://wialon.com"},
    {name:"Teletrac Navman DIRECTOR",website:"https://teletracnavman.com"},
    {name:"BigRoad",website:"https://bigroad.com"},
  ];

  let requestInProgress=false;

  async function authHeaders(){
    const {data,error}=await sb.auth.getSession();
    const token=data?.session?.access_token;
    if(error||!token)throw new Error("Login required");
    return {Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
  }

  async function submitRequest(){
    if(requestInProgress)return;
    requestInProgress=true;

    const eldName=(by("eldRequestName")?.value||"").trim();
    const eldWebsite=(by("eldRequestWebsite")?.value||"").trim();
    const apiDocs=(by("eldRequestApiDocs")?.value||"").trim();
    const notes=(by("eldRequestNotes")?.value||"").trim();
    const msgEl=by("eldRequestMessage");

    if(!eldName){
      if(msgEl)msgEl.textContent="ELD name is required";
      requestInProgress=false;
      return;
    }

    try{
      if(msgEl)msgEl.textContent="Submitting request...";

      const response=await fetch(endpoint(),{
        method:"POST",
        headers:await authHeaders(),
        body:JSON.stringify({
          eld_name:eldName,
          eld_website:eldWebsite||undefined,
          api_documentation:apiDocs||undefined,
          notes:notes||undefined,
          company_id:window.currentCompanyId||window.zapOrganizationId||"unknown"
        })
      });

      const data=await response.json();

      if(!response.ok){
        if(msgEl){
          msgEl.className="error-msg";
          msgEl.style.display="block";
          msgEl.style.background="#f8d7da";
          msgEl.style.color="#842029";
          msgEl.style.padding="10px";
          msgEl.style.borderRadius="4px";
          msgEl.textContent=`Error: ${data.error||"Failed to submit request"}`;
        }
        requestInProgress=false;
        return;
      }

      if(msgEl){
        msgEl.className="success-msg";
        msgEl.style.display="block";
        msgEl.style.background="#d1e7dd";
        msgEl.style.color="#0f5132";
        msgEl.style.padding="10px";
        msgEl.style.borderRadius="4px";
        msgEl.textContent="✓ Request submitted! We'll contact you soon.";
      }

      // Clear form
      by("eldRequestName").value="";
      by("eldRequestWebsite").value="";
      by("eldRequestApiDocs").value="";
      by("eldRequestNotes").value="";

      // Close modal after 2 seconds
      setTimeout(()=>{
        const modal=by("eldRequestModal");
        if(modal)modal.style.display="none";
      },2000);

    }catch(err){
      if(msgEl)msgEl.textContent=`Error: ${err.message}`;
    }finally{
      requestInProgress=false;
    }
  }

  function createModal(){
    if(by("eldRequestModal"))return;

    const modal=document.createElement("div");
    modal.id="eldRequestModal";
    modal.className="modal";
    modal.style.cssText="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;";

    modal.innerHTML=`
      <div class="modal-content" style="background:white;max-width:700px;margin:40px auto;border-radius:8px;padding:30px;max-height:90vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h2 style="margin:0;font-size:24px;">Request ELD Integration</h2>
          <button type="button" class="close-btn" onclick="document.getElementById('eldRequestModal').style.display='none'" style="background:none;border:none;font-size:24px;cursor:pointer;">×</button>
        </div>

        <div style="margin-bottom:30px;">
          <h3>Currently Supported</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px;">
            ${SUPPORTED_ELDS.map(e=>`<div style="padding:12px;border:1px solid #4CAF50;border-radius:4px;background:#f1f8f4;text-align:center;"><strong>${e.name}</strong><br><span style="color:#4CAF50;font-weight:bold;">✓ Ready</span></div>`).join("")}
          </div>
        </div>

        <div style="margin-bottom:30px;">
          <h3>Coming Soon (Popular)</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px;">
            ${COMING_SOON_ELDS.filter(e=>e.popular).map(e=>`<div style="padding:12px;border:1px solid #FFC107;border-radius:4px;background:#fffdf7;text-align:center;"><strong>${e.name}</strong><br><span style="color:#FFC107;font-size:12px;">⏳ Coming</span></div>`).join("")}
          </div>
        </div>

        <hr style="margin:20px 0;border:none;border-top:1px solid #ddd;">

        <h3>Don't see yours?</h3>
        <p style="color:#666;margin-bottom:20px;">Submit your ELD and we'll work on integrating it.</p>

        <form style="display:grid;gap:15px;">
          <label>
            <strong>ELD Provider Name *</strong>
            <input id="eldRequestName" type="text" placeholder="e.g., Verizon Connect, Samsara" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px;margin-top:5px;">
          </label>

          <label>
            <strong>Website (optional)</strong>
            <input id="eldRequestWebsite" type="url" placeholder="https://example.com" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px;margin-top:5px;">
          </label>

          <label>
            <strong>API Documentation Link (optional)</strong>
            <input id="eldRequestApiDocs" type="url" placeholder="https://docs.example.com" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px;margin-top:5px;">
          </label>

          <label>
            <strong>Notes (optional)</strong>
            <textarea id="eldRequestNotes" placeholder="Any additional info about your use case..." style="width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px;margin-top:5px;min-height:80px;"></textarea>
          </label>

          <div id="eldRequestMessage" style="margin-top:10px;padding:10px;border-radius:4px;display:none;"></div>

          <div style="display:flex;gap:10px;margin-top:20px;">
            <button type="button" id="eldRequestSubmit" class="primary-btn" style="flex:1;">Submit Request</button>
            <button type="button" class="small-btn" onclick="document.getElementById('eldRequestModal').style.display='none'" style="flex:1;">Cancel</button>
          </div>
        </form>

        <p style="color:#999;font-size:12px;margin-top:15px;text-align:center;">We'll notify you when this ELD is integrated or if we need more information.</p>
      </div>
    `;

    document.body.appendChild(modal);
    by("eldRequestSubmit").onclick=submitRequest;

    // Close modal when clicking outside
    modal.onclick=(e)=>{if(e.target===modal)modal.style.display="none"};
  }

  function ensureUi(){
    const settings=by("settings");
    if(!settings||by("eldRequestsCard"))return;

    createModal();

    const card=document.createElement("div");
    card.className="card";
    card.id="eldRequestsCard";
    card.innerHTML=`
      <div class="section-title"><h2>ELD Integrations</h2></div>
      <p class="muted">We support Apollo ELD and Next Fleet. Don't see yours? Request it below.</p>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:20px 0;">
        ${SUPPORTED_ELDS.map(e=>`<div style="padding:15px;border:1px solid #4CAF50;border-radius:6px;background:#f9fff7;text-align:center;">
          <div style="font-size:24px;margin-bottom:5px;">✓</div>
          <strong style="display:block;margin-bottom:3px;">${e.name}</strong>
          <span style="color:#4CAF50;font-size:12px;">Available</span>
        </div>`).join("")}

        <div style="padding:15px;border:2px dashed #FFC107;border-radius:6px;background:#fffdf7;text-align:center;cursor:pointer;" onclick="document.getElementById('eldRequestModal').style.display='flex';document.getElementById('eldRequestModal').style.alignItems='center';document.getElementById('eldRequestModal').style.justifyContent='center';">
          <div style="font-size:24px;margin-bottom:5px;">+</div>
          <strong style="display:block;color:#FFC107;">Request ELD</strong>
          <span style="color:#999;font-size:12px;">Not listed?</span>
        </div>
      </div>

      <p class="muted" style="margin-top:20px;">
        <a href="javascript:document.getElementById('eldRequestModal').style.display='flex';document.getElementById('eldRequestModal').style.alignItems='center';document.getElementById('eldRequestModal').style.justifyContent='center';" style="color:#d6a62b;text-decoration:none;font-weight:600;">View all ELDs or submit a request →</a>
      </p>
    `;

    const eldCard=settings.querySelector("#eldIntegrationsCard");
    if(eldCard){
      eldCard.after(card);
    }else{
      settings.appendChild(card);
    }
  }

  // Hook into settings when it's created
  const observer=new MutationObserver(()=>{
    if(by("settings"))ensureUi();
  });

  observer.observe(document.body,{childList:true,subtree:true});

  // Also try immediately
  if(by("settings"))ensureUi();
})();
