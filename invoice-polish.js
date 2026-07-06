(()=>{
if(window.__invoicePolishOn)return;window.__invoicePolishOn=true;
const oldOpen=window.open;
const money=n=>'$'+Number(n||0).toFixed(2);
function clean(html){
  if(typeof html!=='string'||!html.includes('INVOICE'))return html;
  let gross=0;
  const re=/<td>\$([0-9,]+(?:\.\d{1,2})?)<\/td><td>[0-9.]+%<\/td><td>\$[0-9,]+(?:\.\d{1,2})?<\/td>/g;
  let m;
  while((m=re.exec(html))){gross+=Number(m[1].replace(/,/g,''))||0}
  html=html.replace(/<p class="muted">[^<]*<\/p><p class="muted"><b>Gmail:<\/b>[\s\S]*?<\/p>/,'');
  if(gross>0){
    html=html.replace(/<div class="total">Total Due: ([^<]+)<\/div>/,'<div class="total"><div style="font-size:19px">Total Gross: '+money(gross)+'</div><div style="font-size:25px">Total Due: $1</div></div>');
  }
  return html;
}
window.open=function(){
  const w=oldOpen.apply(window,arguments);
  if(w&&w.document){
    const oldWrite=w.document.write.bind(w.document);
    w.document.write=function(x){return oldWrite(clean(x))}
  }
  return w;
};
})();