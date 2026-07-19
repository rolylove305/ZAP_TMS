(()=>{
['tmsDocsStable','storageUploadHelper','storageManageHelper','cardStabilizerHelper','folderGuardHelper','invoiceSelectHelper'].forEach(id=>{const e=document.getElementById(id);if(e&&e.tagName!=='SCRIPT')e.remove()});
function load(id,src){if(document.getElementById(id))return;const s=document.createElement('script');s.id=id;s.src=src;document.body.appendChild(s)}
setTimeout(()=>{
 load('tmsDocsStable','tms-docs-stable.js?v=5200');
 load('storageUploadHelper','storage-upload.js?v=5700');
 load('storageManageHelper','storage-manage.js?v=5500');
 load('cardStabilizerHelper','card-stabilizer.js?v=5600');
 load('invoiceSelectHelper','invoice-select.js?v=zap-logo-1');
},700);
})();