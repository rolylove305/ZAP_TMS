(()=>{
/* Stop the browser's saved-form-history dropdown from suggesting values across
   accounts on a shared computer. Only the logged-in app fields (#appShell) are
   touched; the login form (#authShell) is left alone so password managers keep
   working there. */
function off(root){
  root.querySelectorAll('input,select,textarea').forEach(el=>{
    if(el.getAttribute('autocomplete')==='off')return;
    el.setAttribute('autocomplete','off');
    if(el.tagName==='INPUT'&&!el.getAttribute('name'))el.setAttribute('name','zap_'+Math.random().toString(36).slice(2,9));
  });
}
function apply(){
  const app=document.getElementById('appShell');
  if(app)off(app);
  /* Edit / Docs modals are appended to <body>, outside #appShell */
  document.querySelectorAll('#zapEditModal,#zapDocsModal,#zapDriverLinkModal,#zapLocateModal').forEach(off);
}
function start(){
  apply();
  const mo=new MutationObserver(()=>apply());
  mo.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
