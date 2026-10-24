const { chromium } = require('playwright'); const path=require('path'),fs=require('fs');
const EXT=path.join(__dirname,'../extension');
(async()=>{const ctx=await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/tb-'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`]});
await ctx.route(/^https?:\/\//,r=>r.fulfill({contentType:'text/html',body:'<title>x</title>hi'}));
let [sw]=ctx.serviceWorkers(); if(!sw) sw=await ctx.waitForEvent('serviceworker'); const id=sw.url().split('/')[2];
for(const u of ['https://github.com/a','https://claude.ai/']) {const p=await ctx.newPage(); await p.goto(u);}
const p=await ctx.newPage(); await p.goto(`chrome-extension://${id}/popup.html`);
console.log(await sw.evaluate(async()=>(await chrome.windows.getAll({populate:true})).map(w=>w.id+':'+w.type+':'+w.tabs.length)));
console.log(await p.evaluate(async()=>{const w=await chrome.windows.getCurrent(); return [w.id, JSON.stringify(await chrome.runtime.sendMessage({type:'saveSession',payload:{name:'x',windowId:w.id}}))]}));
await ctx.close();})();
