(()=>{
// Auto refresh disabled: it was repainting the Load Board and making buttons jump.
// Use the Sync from cloud button when you want to manually refresh.
// Load the additive ELD settings module without changing the core app bundle.
if(!document.getElementById('eldIntegrationsModule')){
  const script=document.createElement('script');
  script.id='eldIntegrationsModule';
  script.src='eld-integrations.js?v=multi-eld-nextfleet-1';
  document.body.appendChild(script);
}
})();
