import { chromium } from '/Users/andresvalejo/Documents/Tecnica/Proyecto Argos/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const AXE = readFileSync('/Users/andresvalejo/Documents/Tecnica/Proyecto Argos/node_modules/axe-core/axe.min.js','utf8');
const base='http://127.0.0.1:5262';
const T='A'.repeat(43);
const cases={
 ready:{status:200,body:{petName:'Luna',criticalAllergies:['Penicilina','Pollo'],contactPhones:[{phone:'+573001234567'},{phone:'+573109876543'}]}},
 empty:{status:200,body:{petName:'Luna',criticalAllergies:[],contactPhones:[]}},
 long:{status:200,body:{petName:'Maximiliano Bartolomé de la Santísima Trinidad Tercero',criticalAllergies:['Anestesia general con ketamina y derivados de la misma familia farmacológica','Pollo'],contactPhones:[{phone:'+573001234567'}]}},
 nf:{status:404,body:{title:'x'}},
 rl:{status:429,body:{title:'x'}},
};
const b=await chromium.launch();
for(const [k,c] of Object.entries(cases)){
 for(const w of [320,1024,1280]){
  const ctx=await b.newContext({viewport:{width:w,height:800},locale:'es-CO'});
  const p=await ctx.newPage();
  await p.route('**/api/emergency/**',r=>r.fulfill({status:c.status,contentType:'application/json',body:JSON.stringify(c.body)}));
  await p.goto(`${base}/e/${T}`);
  await p.waitForTimeout(700);
  await p.addScriptTag({content:AXE});
  const r=await p.evaluate(async()=>{const a=await axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']});return {v:a.violations.map(v=>v.id+':'+v.nodes.length),pass:a.passes.length,inc:a.incomplete.map(v=>v.id)}});
  const m=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,title:document.title,h1:document.querySelector('h1')?.textContent,fs:getComputedStyle(document.querySelector('li')||document.body).fontSize}));
  console.log(k,w,JSON.stringify(r),JSON.stringify(m));
  if(w===320&&k==='long') await p.screenshot({path:'long320.png',fullPage:true});
  await ctx.close();
 }
}
await b.close();
