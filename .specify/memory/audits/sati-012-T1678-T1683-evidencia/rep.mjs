import { chromium } from '/Users/andresvalejo/Documents/Tecnica/Proyecto Argos/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const svg=readFileSync('qr.svg','utf8');
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1024,height:800}});
const p=await ctx.newPage();
await p.route('**/api/emergency/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
await p.goto('http://127.0.0.1:5262/e/'+'A'.repeat(43)); await p.waitForTimeout(500);
await p.evaluate(({svg})=>{const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 const f=document.createElement('div');f.style.height='3000px';document.body.appendChild(f);
 const s=document.createElement('div');s.className='qr-a6';s.innerHTML='<h2 class="qr-a6__name">Luna</h2><img class="qr-a6__code" alt="x"><p class="qr-a6__caption">Escanea</p>';s.querySelector('img').src=url;document.body.appendChild(s);document.body.classList.add('printing-qr');},{svg});
await p.waitForTimeout(400); await p.emulateMedia({media:'print'});
for (const r of ['1','2','3','4']) { try{const pdf=await p.pdf({pageRanges:r});const t=pdf.toString('latin1');console.log('page',r,'bytes',pdf.length,'paths(re ops)',(t.match(/ re\b/g)||[]).length);}catch(e){console.log(r,'err',e.message.slice(0,60))}}
await b.close();
