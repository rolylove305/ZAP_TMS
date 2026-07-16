(()=>{
// Auto refresh disabled: it was repainting the Load Board and making buttons jump.
// Use the Sync from cloud button when you want to manually refresh.
// ELD integrations are loaded directly from index.html.
if(!document.getElementById("eldLocationModule")){
  const script=document.createElement("script");
  script.id="eldLocationModule";
  script.src="eld-location.js?v=nextfleet-gps-1";
  script.defer=true;
  document.body.appendChild(script);
}
})();
