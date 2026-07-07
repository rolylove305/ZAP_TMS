(()=>{
function mark(id){if(document.getElementById(id))return;const x=document.createElement('i');x.id=id;x.style.display='none';document.head.appendChild(x)}
['tmsDocsStable','storageUploadHelper','storageManageHelper','cardStabilizerHelper','folderGuardHelper','invoiceSelectHelper'].forEach(mark);
function load(id,src){if(document.getElementById(id)&&document.getElementById(id).tagName==='SCRIPT')return;const old=document.getElementById(id);if(old&&old.tagName!=='SCRIPT')old.remove();const s=document.createElement('script');s.id=id;s.src=src;document.body.appendChild(s)}
function run(){
  load('tmsDashboardStable','tms-dashboard-stable.js?v=5200');
  load('docsQuietHelper','docs-quiet.js?v=6000');
  load('companySettingsHelper','company-settings.js?v=6000');
}
setTimeout(run,500);
setTimeout(run,2500);
})();