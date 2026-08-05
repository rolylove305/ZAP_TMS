(()=>{
const by=id=>document.getElementById(id);
function addInput(after,id,label,type='text'){if(by(id))return;const a=by(after);if(!a)return;const l=document.createElement('label');l.textContent=label;const x=document.createElement('input');x.id=id;x.type=type;l.appendChild(x);a.closest('label')?.after(l)}
function fields(){addInput('pickup','pickupAddress','Full pickup address');addInput('delivery','deliveryAddress','Full delivery address');addInput('deliveryAddress','loadMiles','Miles','number')}
function tabs(){if(typeof window.zapEnsureLoadFolderTabs==='function')window.zapEnsureLoadFolderTabs();if(typeof window.zapRenderLoadFolderTabs==='function')window.zapRenderLoadFolderTabs()}
function run(){fields();tabs()}
setTimeout(run,1000);
})();
