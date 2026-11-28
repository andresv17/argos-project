import { chromium } from '/Users/andresvalejo/Documents/Tecnica/Proyecto Argos/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const svg=readFileSync('qr.svg','utf8');
const b=await chromium.launch();
for (const longApp of [false,true]) {
 const ctx=await b.newContext({viewport:{width:1024,height:800}});
 const p=await ctx.newPage();
 await p.route('**/api/emergency/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
 await p.goto('http://127.0.0.1:5262/e/'+'A'.repeat(43));
 await p.waitForTimeout(500);
 await p.evaluate(({svg,longApp})=>{
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  const filler=document.createElement('div'); filler.id='filler'; filler.style.height=longApp?'3000px':'100px'; filler.textContent='App content';
  document.body.appendChild(filler);
  const s=document.createElement('div'); s.className='qr-a6'; s.setAttribute('data-testid','qr-a6');
  s.innerHTML='<h2 class="qr-a6__name">Luna</h2><img class="qr-a6__code" alt="Código QR de la ficha de emergencia"><p class="qr-a6__caption">Escanea para ver datos de emergencia</p>';
  s.querySelector('img').src=url; document.body.appendChild(s);
  document.body.classList.add('printing-qr');
 },{svg,longApp});
 await p.waitForTimeout(400);
 await p.emulateMedia({media:'print'});
 const geo=await p.evaluate(()=>{const i=document.querySelector('.qr-a6__code').getBoundingClientRect();const s=document.querySelector('.qr-a6').getBoundingClientRect();const mm=96/25.4;return {imgMm:[i.width/mm,i.height/mm],sheetMm:[s.width/mm,s.height/mm],bg:getComputedStyle(document.querySelector('.qr-a6')).backgroundColor,color:getComputedStyle(document.querySelector('.qr-a6__name')).color,nameFs:getComputedStyle(document.querySelector('.qr-a6__name')).fontSize,cap:getComputedStyle(document.querySelector('.qr-a6__caption')).fontSize}});
 console.log('longApp',longApp,JSON.stringify(geo));
 for (const pref of [true,false]) {
  const pdf=await p.pdf({preferCSSPageSize:pref,printBackground:true});
  writeFileSync(`out-${longApp}-${pref}.pdf`,pdf);
  const txt=pdf.toString('latin1');
  const pages=[...txt.matchAll(/\/Type\s*\/Page\b/g)].length;
  const mb=[...txt.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map(m=>m[1]);
  console.log(' prefer',pref,'pages',pages,'mediabox',mb.join(' | '));
 }
 await ctx.close();
}
// PNG test: replicate svgToPngBlob at 1024
const ctx=await b.newContext(); const p=await ctx.newPage(); await p.goto('about:blank');
const res=await p.evaluate(async(svg)=>{
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 const img=new Image(); await new Promise((a,r)=>{img.onload=a;img.onerror=r;img.src=url});
 const size=1024; const c=document.createElement('canvas'); c.width=size;c.height=size; const x=c.getContext('2d'); x.fillStyle='#fff';x.fillRect(0,0,size,size); x.imageSmoothingEnabled=false; x.drawImage(img,0,0,size,size);
 const d=x.getImageData(0,0,size,size).data; const mod=size/49;
 // grey (antialias) pixel count and run lengths along row through first finder (module row 4+0 .. ), scan row at y=(4+0.5)*mod
 let grey=0; for(let i=0;i<d.length;i+=4){const v=d[i]; if(v>8&&v<247)grey++;}
 const y=Math.floor((4+3.5)*mod); const runs=[]; let cur=d[(y*size)*4]<128?1:0,len=0;
 for(let xx=0;xx<size;xx++){const v=d[(y*size+xx)*4]<128?1:0; if(v===cur)len++; else {runs.push([cur,len]);cur=v;len=1;}} runs.push([cur,len]);
 return {mod,grey,runs:runs.slice(0,12),naturalW:img.naturalWidth};
},svg);
console.log(JSON.stringify(res));
await b.close();
