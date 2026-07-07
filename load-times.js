(()=>{
function load(id,src){if(document.getElementById(id))return;const s=document.createElement('script');s.id=id;s.src=src;document.body.appendChild(s)}
function run(){
  load('tmsDashboardStable','tms-dashboard-stable.js?v=5200');
  load('tmsDocsStable','tms-docs-stable.js?v=5200');
  load('storageUploadHelper','storage-upload.js?v=5400');
}
setTimeout(run,500);
setInterval(run,5000);
})();