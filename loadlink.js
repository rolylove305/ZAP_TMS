(()=>{
// Step 2 (stabilize-load-board): DOM button injection disabled.
// "Driver Link" and "Location" are now rendered natively by app.js renderLoads()
// and handled by its delegated click listener (create_driver_link RPC flow unchanged).
// This file now only keeps its loader role for phase2.js (folder tabs via
// load-board-stable.js), invoice-select.js (Invoice selected), and small
// additive helpers that do not patch app.js directly.
function addHelper(id,src){if(!document.getElementById(id)){const s=document.createElement('script');s.id=id;s.src=src;document.body.appendChild(s)}}
function helpers(){addHelper('phase2Helper','phase2.js?v=step5-archive-visible');addHelper('invoiceSelectHelper','invoice-select.js?v=step4e-devicegmail');addHelper('savedInvoicesHelper','saved-invoices.js?v=step6-delete-direct')}
setTimeout(helpers,1000);
})();
