import { chromium } from '/Users/andresvalejo/Documents/Tecnica/Proyecto Argos/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const AXE=readFileSync('/Users/andresvalejo/Documents/Tecnica/Proyecto Argos/node_modules/axe-core/axe.min.js','utf8');
const b=await chromium.launch();
for (const mode of ['500','hang']) for (const w of [320,1280]) {
 const p=await (await b.newContext({viewport:{width:w,height:800}})).newPage();
 await p.route('**/api/emergency/**',r=>mode==='500'?r.fulfill({status:500,body:'{}'}):new Promise(()=>{}));
 await p.goto('http://127.0.0.1:5262/e/'+'A'.repeat(43)); await p.waitForTimeout(700);
 await p.addScriptTag({content:AXE});
 const r=await p.evaluate(async()=>{const a=await axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice']});return a.violations.map(v=>v.id+':'+v.nodes.length)});
 console.log(mode,w,JSON.stringify(r),await p.evaluate(()=>document.body.innerText.slice(0,80)));
}
await b.close();
