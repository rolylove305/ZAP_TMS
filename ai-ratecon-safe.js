(()=>{
  /* Defensive overlay for Rate Confirmation imports.
     Loaded after app.js so it can safely replace only the affected functions. */

  function isStrictPositiveNumber(val){
    if(val===null||val===undefined||val==="")return false;
    const n=Number(val);
    return Number.isFinite(n)&&n>0;
  }

  function isValidDateString(ds){
    if(!ds||!/^\d{4}-\d{2}-\d{2}$/.test(ds))return false;
    const d=new Date(ds+"T00:00:00Z");
    return !Number.isNaN(d.getTime())&&d.toISOString().startsWith(ds);
  }

  function isValidTimeString(ts){
    if(ts===null||ts===undefined||String(ts).trim()==="")return true;
    return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(ts).trim());
  }

  function hasText(val){
    return val!==null&&val!==undefined&&String(val).trim()!=="";
  }

  function hasMeaningfulExistingValue(field,value){
    if(field==="rate"||field==="miles")return isStrictPositiveNumber(value);
    if(field==="pickupDate"||field==="deliveryDate"){
      return isValidDateString(String(value??"").trim());
    }
    if(field==="pickupTime"||field==="deliveryTime"){
      return hasText(value)&&isValidTimeString(String(value).trim());
    }
    return hasText(value);
  }

  function valuesAreEquivalent(field,current,incoming){
    if(field==="rate"||field==="miles"){
      return isStrictPositiveNumber(current)&&
        isStrictPositiveNumber(incoming)&&
        Number(current)===Number(incoming);
    }
    return String(current??"").trim()===String(incoming??"").trim();
  }

  updateRow=async function(t,item){
    if(!item||!item.id)return false;
    setBusy(true);
    try{
      const {data,error}=await sb
        .from(t)
        .update(map[t].toDb(item))
        .eq("id",item.id)
        .select()
        .single();
      if(error)throw error;
      const idx=appData[t].findIndex(x=>x.id===item.id);
      if(idx>-1)appData[t][idx]=map[t].fromDb(data);
      cache();
      refresh();
      return true;
    }catch(e){
      alert("Update error: "+(e&&e.message?e.message:String(e)));
      return false;
    }finally{
      setBusy(false);
    }
  };

  zapParseRateCon=async function(l,kind,storagePath){
    if(!l||!l.id||!/rate/i.test(String(kind||"")))return;

    let notice;
    try{
      const sess=(await sb.auth.getSession()).data.session;
      if(!sess){
        alert("Session expired. Please log in again to use the AI parser.");
        return;
      }

      notice=zapToast("Reading Rate Con with AI…");
      const res=await fetch(cfg.url+"/functions/v1/parse-ratecon",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":"Bearer "+sess.access_token,
          "apikey":cfg.token
        },
        body:JSON.stringify({storage_path:storagePath})
      });

      const ai=await res.json().catch(()=>null);
      if(notice){notice.remove();notice=null}

      if(!res.ok||!ai||ai.error){
        const rawErr=ai&&ai.error?String(ai.error):"";
        const isQuota=res.status===429||
          /quota|rate.?limit|exceeded|resource_?exhausted|too many requests|retry in/i.test(rawErr);
        if(isQuota){
          alert(
            "AI limit reached for now. Please wait a moment and try again, "+
            "or fill the load manually."
          );
        }else{
          const noBody=!ai||!ai.error;
          const diag="[HTTP "+res.status+
            (res.statusText?" "+res.statusText:"")+
            (noBody?" · no JSON body → likely timeout/gateway":"")+"]";
          alert(
            "AI could not read this Rate Con "+diag+
            (rawErr?":\n"+rawErr:".")+
            "\nYou can still fill the load manually."
          );
        }
        return;
      }

      /* AI: if the Rate Con named a broker company we don't have yet, save it to brokers.
         Isolated + defensive: if it fails, it never blocks the Rate Con flow. */
      try{
        const bd=ai.broker_details;
        const bName=bd&&bd.company?String(bd.company).trim():"";
        if(bName){
          const exists=(appData.brokers||[]).some(function(b){
            return String(b.name||"").trim().toLowerCase()===bName.toLowerCase();
          });
          if(!exists){
            /* The brokers table has no address/fax/MC columns, so pack that
               extra detail into Notes to keep a richer broker record. */
            const notesParts=[];
            if(bd.location&&String(bd.location).trim())notesParts.push(String(bd.location).trim());
            if(bd.fax&&String(bd.fax).trim())notesParts.push("Fax: "+String(bd.fax).trim());
            if(bd.mc_number&&String(bd.mc_number).trim())notesParts.push("MC/DOT: "+String(bd.mc_number).trim());
            const brokerObj={
              name:bName,
              contact:bd.contact?String(bd.contact).trim():"",
              phone:bd.phone?String(bd.phone).trim():"",
              email:bd.email?String(bd.email).trim():"",
              source:"AI Rate Con",
              notes:notesParts.join(" • ")
            };
            const brokerRes=await sb.from("brokers").insert(map.brokers.toDb(brokerObj)).select().single();
            if(!brokerRes.error&&brokerRes.data){
              appData.brokers.push(map.brokers.fromDb(brokerRes.data));
              refresh();
            }else if(brokerRes.error){
              console.warn("AI broker auto-save failed:",brokerRes.error.message);
            }
          }
        }
      }catch(brokerErr){
        console.warn("AI broker auto-save skipped:",brokerErr);
      }

      const patch={};
      let hasConflict=false;
      let aiDataInvalid=false;

      function applyAiValue(field,value){
        const existing=l[field];
        if(hasMeaningfulExistingValue(field,existing)){
          if(!valuesAreEquivalent(field,existing,value))hasConflict=true;
          return;
        }
        patch[field]=value;
      }

      ["rate","miles"].forEach(k=>{
        const v=ai[k];
        if(v!==undefined&&v!==null&&String(v).trim()!==""){
          if(isStrictPositiveNumber(v))applyAiValue(k,Number(v));
          else aiDataInvalid=true;
        }
      });

      ["pickupDate","deliveryDate"].forEach(k=>{
        const v=ai[k];
        if(v!==undefined&&v!==null&&String(v).trim()!==""){
          const normalized=String(v).trim();
          if(isValidDateString(normalized))applyAiValue(k,normalized);
          else aiDataInvalid=true;
        }
      });

      ["pickupTime","deliveryTime"].forEach(k=>{
        const v=ai[k];
        if(v!==undefined&&v!==null&&String(v).trim()!==""){
          const normalized=String(v).trim();
          if(isValidTimeString(normalized))applyAiValue(k,normalized);
          else aiDataInvalid=true;
        }
      });

      [
        "broker","loadNumber","equipment","pickup","pickupAddress",
        "pickupNumber","delivery","deliveryAddress","deliveryNumber"
      ].forEach(k=>{
        const v=ai[k];
        if(v!==undefined&&v!==null&&String(v).trim()!==""){
          applyAiValue(k,String(v).trim());
        }
      });

      let combinedNotes=hasText(l.notes)?String(l.notes).trim():"";
      if(hasText(ai.notes)){
        const newNotes=String(ai.notes).trim();
        if(!combinedNotes.includes(newNotes)){
          combinedNotes=combinedNotes?combinedNotes+"\n"+newNotes:newNotes;
        }
      }

      const hasManualStops=Array.isArray(l.stops)&&l.stops.length>0;
      let validatedAiStops=[];

      if(Array.isArray(ai.stops)&&ai.stops.length>0){
        if(hasManualStops){
          hasConflict=true;
        }else{
          validatedAiStops=ai.stops.map(rawStop=>{
            const s=rawStop&&typeof rawStop==="object"&&!Array.isArray(rawStop)
              ?rawStop
              :{};
            const d=s.date?String(s.date).trim():"";
            const t=s.time?String(s.time).trim():"";
            const validDate=d===""||isValidDateString(d);
            const validTime=t===""||isValidTimeString(t);
            if(!validDate||!validTime)aiDataInvalid=true;
            return {
              address:s.address?String(s.address).trim():"",
              num:s.num?String(s.num).trim():"",
              time:validTime?t:"",
              date:validDate?d:""
            };
          });
        }
      }

      const merged={
        ...l,
        ...patch,
        notes:combinedNotes,
        stops:hasManualStops?l.stops:validatedAiStops,
        driverName:l.driverName||"",
        driverPhone:l.driverPhone||"",
        truckNumber:l.truckNumber||"",
        trailerNumber:l.trailerNumber||""
      };

      let isComplete=true;
      if(!isValidDateString(merged.pickupDate))isComplete=false;
      if(!isValidDateString(merged.deliveryDate))isComplete=false;
      if(!isValidTimeString(merged.pickupTime))isComplete=false;
      if(!isValidTimeString(merged.deliveryTime))isComplete=false;
      if(!isStrictPositiveNumber(merged.rate))isComplete=false;
      if(!isStrictPositiveNumber(merged.miles))isComplete=false;
      if(!hasText(merged.broker))isComplete=false;
      if(!hasText(merged.loadNumber))isComplete=false;
      if(!hasText(merged.pickup))isComplete=false;
      if(!hasText(merged.delivery))isComplete=false;
      if(!hasText(merged.pickupAddress))isComplete=false;
      if(!hasText(merged.deliveryAddress))isComplete=false;
      if(!hasText(merged.equipment))isComplete=false;

      const stopsValid=(Array.isArray(merged.stops)?merged.stops:[]).every(stop=>{
        const s=stop&&typeof stop==="object"&&!Array.isArray(stop)?stop:{};
        const date=s.date?String(s.date).trim():"";
        const time=s.time?String(s.time).trim():"";
        return hasText(s.address)&&
          (date===""||isValidDateString(date))&&
          (time===""||isValidTimeString(time));
      });
      if(!stopsValid)isComplete=false;

      const aiNeedsReview=!ai._meta||ai._meta.needsReview!==false;
      const forceReview=aiNeedsReview||aiDataInvalid||hasConflict||!isComplete;

      if(forceReview){
        actionEdit(merged);
      }else{
        const saved=await updateRow("loads",merged);
        if(saved)alert("Rate Con imported and saved automatically.");
      }
    }catch(e){
      if(notice)notice.remove();
      console.warn("parse-ratecon failed",e);
      alert("System Error processing document: "+(e&&e.message?e.message:String(e)));
    }
  };

  actionEdit=function(l){
    const F=[
      ["Broker","broker","text"],
      ["Pickup city/state","pickup","text"],
      ["Delivery city/state","delivery","text"],
      ["Pickup date","pickupDate","date"],
      ["Delivery date","deliveryDate","date"],
      ["Pickup time","pickupTime","time"],
      ["Delivery time","deliveryTime","time"],
      ["Full pickup address","pickupAddress","text"],
      ["Full delivery address","deliveryAddress","text"],
      ["Miles","miles","number"],
      ["Equipment","equipment","text"],
      ["Rate $","rate","number"],
      ["Load #","loadNumber","text"],
      ["Pickup #","pickupNumber","text"],
      ["Delivery #","deliveryNumber","text"],
      ["Driver name","driverName","text"],
      ["Driver phone","driverPhone","text"],
      ["Truck #","truckNumber","text"],
      ["Trailer #","trailerNumber","text"]
    ];
    if(window.zapAccountType==="dispatcher")F.splice(12,0,["Dispatcher %","commissionPct","number"]);
    if(window.zapAccountType==="carrier")F.push(
      ["Fuel cost $","fuelCost","number"],
      ["Driver / Owner Op pay $","driverCost","number"],
      ["Tolls $","tollsCost","number"],
      ["Maintenance reserve $","maintenanceCost","number"],
      ["Other load costs $","otherCost","number"]
    );
    F.push(["Notes","notes","text"]);
    const ALL=[...LOAD_STATUSES,"Archived","Cancelled"];
    let modal=document.getElementById("zapEditModal");
    if(!modal){
      modal=document.createElement("div");
      modal.id="zapEditModal";
      modal.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px";
      document.body.appendChild(modal);
    }
    modal.innerHTML='<div class="card" style="width:min(760px,96vw);max-height:88vh;overflow:auto"><div class="section-title"><h2>Edit Load</h2><button class="small-btn" id="zeClose">Close</button></div><div class="form-grid">'
      +'<label>Status<select id="ze_status">'+ALL.map(s=>'<option'+(s===l.status?' selected':'')+'>'+esc(s)+'</option>').join('')+'</select></label>'
      +F.map(f=>'<label>'+esc(f[0])+'<input id="ze_'+f[1]+'" type="'+f[2]+'"'+(f[2]==="number"?' step="0.01"':'')+' value="'+esc(l[f[1]]??'')+'"></label>').join('')
      +'</div>'
      +'<div style="margin-top:12px"><div class="section-title" style="margin-bottom:6px"><h3 style="margin:0;font-size:15px">Additional stops (optional)</h3><button type="button" class="small-btn" id="zeAddStop">+ Add stop</button></div><div id="zeStops"></div></div>'
      +'<div class="card-actions" style="margin-top:12px"><button class="small-btn" id="zeSave">Save changes</button></div></div>';

    modal.querySelector("#zeClose").onclick=()=>modal.remove();
    initStopsEditor(modal.querySelector("#zeStops"),modal.querySelector("#zeAddStop"),l.stops);

    const saveBtn=modal.querySelector("#zeSave");
    saveBtn.onclick=async()=>{
      if(saveBtn.disabled)return;
      saveBtn.disabled=true;
      saveBtn.textContent="Saving…";

      const upd={...l,status:modal.querySelector("#ze_status").value};
      F.forEach(f=>{upd[f[1]]=modal.querySelector("#ze_"+f[1]).value});
      upd.stops=collectStops(modal.querySelector("#zeStops"));

      const saved=await updateRow("loads",upd);
      if(saved){
        modal.remove();
      }else{
        saveBtn.disabled=false;
        saveBtn.textContent="Save changes";
      }
    };
  };

  window.updateRow=updateRow;
  window.zapParseRateCon=zapParseRateCon;
  window.actionEdit=actionEdit;
})();
