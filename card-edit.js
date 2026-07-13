(()=>{
  /* Adds an "Edit" button to Broker and Carrier cards (they only had Delete).
     Isolated overlay loaded after app.js: it wraps the existing render
     functions to inject the button, and opens a small edit modal that saves
     through the existing global updateRow(). Nothing here changes or removes
     any current behavior. */

  const FIELDS={
    brokers:[
      ["Broker company","name"],
      ["Contact","contact"],
      ["Phone","phone"],
      ["Email","email"],
      ["Loadboard / Source","source"],
      ["Notes","notes"]
    ],
    carriers:[
      ["Carrier name","name"],
      ["MC / DOT","mcDot"],
      ["Contact","contact"],
      ["Phone","phone"],
      ["Email","email"],
      ["Equipment","equipment"],
      ["Trucks","trucks"],
      ["Default commission %","commission"]
    ]
  };

  function openEditor(type,index){
    const item=(appData[type]||[])[index];
    if(!item||!item.id){alert("Save/sync this record first before editing.");return}
    const fields=FIELDS[type]||[];
    const title=type==="brokers"?"Edit Broker":"Edit Carrier";

    let modal=document.getElementById("zapCardEditModal");
    if(!modal){
      modal=document.createElement("div");
      modal.id="zapCardEditModal";
      modal.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px";
      document.body.appendChild(modal);
    }

    modal.innerHTML='<div class="card" style="width:min(680px,96vw);max-height:88vh;overflow:auto"><div class="section-title"><h2>'+esc(title)+'</h2><button class="small-btn" id="zceClose">Close</button></div><div class="form-grid">'
      +fields.map(function(f){
        return '<label>'+esc(f[0])+'<input id="zce_'+f[1]+'" type="text" value="'+esc(item[f[1]]!=null?item[f[1]]:"")+'"></label>';
      }).join('')
      +'</div><div class="card-actions" style="margin-top:12px"><button class="small-btn" id="zceSave">Save changes</button></div></div>';

    modal.querySelector("#zceClose").onclick=function(){modal.remove()};

    const saveBtn=modal.querySelector("#zceSave");
    saveBtn.onclick=async function(){
      if(saveBtn.disabled)return;
      saveBtn.disabled=true;
      saveBtn.textContent="Saving…";
      const upd=Object.assign({},item);
      fields.forEach(function(f){
        upd[f[1]]=modal.querySelector("#zce_"+f[1]).value;
      });
      const ok=await updateRow(type,upd);
      if(ok!==false){
        modal.remove();
      }else{
        saveBtn.disabled=false;
        saveBtn.textContent="Save changes";
      }
    };
  }
  window.zapEditEntity=openEditor;

  function injectEditButtons(type,listId){
    const list=document.getElementById(listId);
    if(!list)return;
    const cards=list.querySelectorAll(".list-card");
    cards.forEach(function(cardEl,i){
      const actions=cardEl.querySelector(".card-actions");
      if(!actions||actions.querySelector(".zap-edit-btn"))return;
      const btn=document.createElement("button");
      btn.className="small-btn zap-edit-btn";
      btn.textContent="Edit";
      btn.onclick=function(){openEditor(type,i)};
      actions.insertBefore(btn,actions.firstChild);
    });
  }

  function wrap(name,type,listId){
    const orig=window[name];
    if(typeof orig!=="function")return;
    window[name]=function(){
      const r=orig.apply(this,arguments);
      injectEditButtons(type,listId);
      return r;
    };
  }

  wrap("renderBrokers","brokers","brokersList");
  wrap("renderCarriers","carriers","carriersList");

  /* If the app already rendered before this file loaded, add the buttons now. */
  try{
    if(typeof appData!=="undefined"&&appData){
      injectEditButtons("brokers","brokersList");
      injectEditButtons("carriers","carriersList");
    }
  }catch(e){}
})();
