(()=>{
// Step 2 (stabilize-load-board): DOM button injection disabled.
// "Driver Link" and "Location" are now rendered natively by app.js renderLoads()
// and handled by its delegated click listener (create_driver_link RPC flow unchanged).
// This file now only keeps its loader role for phase2.js (folder tabs via
// load-board-stable.js) and invoice-select.js (Invoice selected) until Step 3
// moves those into the main app.
function helpers(){if(!document.getElementById('phase2Helper')){const s=document.createElement('script');s.id='phase2Helper';s.src='phase2.js?v=5900';document.body.appendChild(s)}if(!document.getElementById('invoiceSelectHelper')){const h=document.createElement('script');h.id='invoiceSelectHelper';h.src='invoice-select.js?v=step4e-devicegmail';document.body.appendChild(h)}}
setTimeout(helpers,1000);
})();
