import{R as H,c as W,C as q,N as V,a as Z,F as G}from"./ForceLayoutAdapter-DH2M9pEs.js";function K(e,n,t={}){const a=t.iterations??100,s=t.padding??4,c=new H;for(let i=0;i<a;i++){c.clear();const l=e.map(r=>({minX:r.x-r.width/2,minY:r.y-r.height/2,maxX:r.x+r.width/2,maxY:r.y+r.height/2,rect:r}));c.load(l);let o=!1;const h=new Set;for(const r of l){const p=c.search({minX:r.minX-s,minY:r.minY-s,maxX:r.maxX+s,maxY:r.maxY+s});for(const f of p){if(f.rect===r.rect)continue;const w=[r.rect.id,f.rect.id];w.sort();const E=w[0]+"|"+w[1];h.has(E)||(h.add(E),O(r.rect,f.rect,s)&&(o=!0))}}if(!o)break}const m=20,d=.1;for(let i=0;i<m;i++){c.clear();const l=e.map(o=>({minX:o.x-o.width/2,minY:o.y-o.height/2,maxX:o.x+o.width/2,maxY:o.y+o.height/2,rect:o}));c.load(l);for(const o of e){const h=n.get(o.id);if(!h)continue;const r=(h.x-o.x)*d,p=(h.y-o.y)*d;if(Math.abs(r)<.1&&Math.abs(p)<.1)continue;const f=o.x+r,w=o.y+p,E=c.search({minX:f-o.width/2-s,minY:w-o.height/2-s,maxX:f+o.width/2+s,maxY:w+o.height/2+s});let X=!0;for(const B of E){if(B.rect===o)continue;const A=o.width/2+B.rect.width/2+s-Math.abs(f-B.rect.x),F=o.height/2+B.rect.height/2+s-Math.abs(w-B.rect.y);if(A>0&&F>0){X=!1;break}}X&&(o.x=f,o.y=w)}}}function O(e,n,t=0){const a=e.width/2+n.width/2+t-Math.abs(e.x-n.x),s=e.height/2+n.height/2+t-Math.abs(e.y-n.y);if(a<=0||s<=0)return!1;const c=1/(1+(e.degree||0)),m=1/(1+(n.degree||0)),d=c+m,i=c/d,l=m/d;if(a<s){const o=e.x>n.x?1:-1,h=a+.2;e.x+=h*o*i,n.x-=h*o*l}else{const o=e.y>n.y?1:-1,h=s+.2;e.y+=h*o*i,n.y-=h*o*l}return!0}const P=document.getElementById("container"),b=document.getElementById("categorySelect"),S=document.getElementById("depthSlider"),_=document.getElementById("depthValue"),j=document.getElementById("btnReset"),z=document.getElementById("btnToggleLayout"),U=document.getElementById("nodeCount"),J=document.getElementById("edgeCount"),Q=document.getElementById("zoomLevel"),N=document.getElementById("layoutStatus"),Y=document.getElementById("wordDetail"),tt=document.getElementById("closeDetail");let $=null,g=null,v=null,y=null,x=null,u=null,M=!0,C=new Map,k=new Map;const et="./hypernym-dag-v2.json",L=document.createElement("div");L.className="loading";L.textContent="Loading vocabulary data";document.body.appendChild(L);async function nt(){try{$=await(await fetch(et)).json(),L.remove(),v=W(P,{viewBox:{left:-300,top:-300,right:300,bottom:300},panZoom:{minZoom:.1,maxZoom:50}}),x=new q({container:P,color:"#c7c7cc",width:1,opacity:.4});const n=t=>t.degree||0;y=new V({maxScale:2,levels:[{type:"text",text:t=>t.hanzi,fontSize:10,fill:"#48484a",fontFamily:"'Noto Sans SC', -apple-system, sans-serif",fontWeight:"600"},{minZoom:.7,layers:[{type:"circle",radius:3,fill:t=>I(t.hsk),opacity:.3},{type:"text",text:t=>t.hanzi,fontSize:11,fill:"#1d1d1f",fontFamily:"'Noto Sans SC', -apple-system, sans-serif",fontWeight:"600"}]},{minZoom:1.7,importance:n,hitArea:{type:"rect",width:t=>Math.max(50,t.hanzi.length*16+20),height:36},layers:[{type:"svg",create:(t,a)=>{const s=t.hanzi.length,c=Math.max(50,s*16+20);return`
                  <rect x="${-(c/2)}" y="-18" width="${c}" height="36" rx="6"
                    fill="white" stroke="#d2d2d7" stroke-width="1"/>
                  <text
                    y="${t.pinyin?-4:0}"
                    text-anchor="middle"
                    dominant-baseline="${t.pinyin?"auto":"central"}"
                    font-size="14"
                    font-weight="600"
                    fill="#1d1d1f"
                    font-family="'Noto Sans SC', -apple-system, sans-serif"
                  >${t.hanzi}</text>`}},{type:"text",text:t=>t.pinyin,fontSize:9,fill:"#86868b",anchor:"bottom",offset:[0,10],visible:t=>!!t.pinyin}]},{minZoom:4,importance:n,hitArea:{type:"rect",width:t=>Math.max(90,t.hanzi.length*20+30),height:64},layers:[{type:"svg",create:(t,a)=>{const s=t.definition?t.definition.length>12?t.definition.slice(0,12)+"...":t.definition:"",c=I(t.hsk),m=t.hanzi.length,d=Math.max(90,m*20+30),i=d/2;return`
                  <rect x="${-i}" y="-32" width="${d}" height="64" rx="10"
                    fill="white" stroke="#d2d2d7" stroke-width="1.5"
                    filter="url(#card-shadow)"/>
                  ${t.hsk?`
                    <rect x="${i-22}" y="-28" width="18" height="14" rx="3" fill="${c}"/>
                    <text x="${i-13}" y="-18" text-anchor="middle" font-size="8" fill="white" font-weight="600">${t.hsk}</text>
                  `:""}
                  <text
                    y="-8"
                    text-anchor="middle"
                    font-size="18"
                    font-weight="700"
                    fill="#1d1d1f"
                    font-family="'Noto Sans SC', -apple-system, sans-serif"
                  >${t.hanzi}</text>
                  ${t.pinyin?`
                    <text
                      y="8"
                      text-anchor="middle"
                      font-size="11"
                      fill="#0071e3"
                      font-weight="500"
                      font-family="-apple-system, sans-serif"
                    >${t.pinyin}</text>
                  `:""}
                  ${s?`
                    <text
                      y="22"
                      text-anchor="middle"
                      font-size="9"
                      fill="#86868b"
                      font-family="-apple-system, sans-serif"
                    >${s}</text>
                  `:""}`}}]},{minZoom:8,importance:n,hitArea:{type:"rect",width:t=>Math.max(130,t.hanzi.length*28+40),height:90},layers:[{type:"svg",create:(t,a)=>{const s=I(t.hsk),c=t.definition||"",m=t.hanzi.length,d=Math.max(130,m*28+40),i=d/2,l=c.length>18?c.slice(0,18)+"...":c;return`
                  <rect x="${-i}" y="-45" width="${d}" height="90" rx="12"
                    fill="white" stroke="#d2d2d7" stroke-width="1.5"
                    filter="url(#card-shadow)"/>
                  ${t.hsk?`
                    <rect x="${i-28}" y="-40" width="24" height="16" rx="4" fill="${s}"/>
                    <text x="${i-16}" y="-28" text-anchor="middle" font-size="10" fill="white" font-weight="600">HSK${t.hsk}</text>
                  `:""}
                  <text
                    y="-14"
                    text-anchor="middle"
                    font-size="26"
                    font-weight="700"
                    fill="#1d1d1f"
                    font-family="'Noto Sans SC', -apple-system, sans-serif"
                  >${t.hanzi}</text>
                  ${t.pinyin?`
                    <text
                      y="6"
                      text-anchor="middle"
                      font-size="14"
                      fill="#0071e3"
                      font-weight="500"
                      font-family="-apple-system, sans-serif"
                    >${t.pinyin}</text>
                  `:""}
                  ${c?`
                    <text
                      y="26"
                      text-anchor="middle"
                      font-size="11"
                      fill="#48484a"
                      font-family="-apple-system, sans-serif"
                    >${l}</text>
                  `:""}`}}]}]}),v.addCollection(x),v.addCollection(y),dt(v.svg),await D(b.value,parseInt(S.value)),v.on("transform",t=>{Q.textContent=t.scale.toFixed(2)+"x"}),rt()}catch(e){console.error("Failed to initialize:",e),L.textContent="Failed to load data: "+e.message}}async function D(e,n){var s,c,m,d;u&&(u.stop(),u.dispose()),y&&y.clear(),x&&x.clear(),C.clear(),k.clear(),g=Z();const t=new Set,a=[{word:e,depth:0}];for(t.add(e);a.length>0;){const{word:i,depth:l}=a.shift(),o=((s=$.wordInfo)==null?void 0:s[i])||{},h=((c=$.definitions)==null?void 0:c[i])||"",r=((m=$.freq)==null?void 0:m[i])||0;if(g.addNode(i,{hanzi:i,pinyin:o.pinyin||"",hsk:o.hsk||null,definition:h,freq:r,depth:l}),l<n){const p=((d=$.children)==null?void 0:d[i])||[];for(const f of p)t.has(f)?g.hasNode(f)&&(g.hasLink(i,f)||g.addLink(i,f)):(t.add(f),a.push({word:f,depth:l+1}),g.addLink(i,f))}}g.forEachNode(i=>{const l=g.getLinks(i.id),o=l?l.size??l.length??0:0;i.data.degree=o}),u=new G(g,{springLength:50,springCoefficient:4e-4,gravity:-1.5,energyThreshold:.5,onStabilized:async()=>{let i=await u.getBounds();await v.fitToView(i,80),N.textContent="Removing overlaps...",await at(),i=await u.getBounds(),await v.fitToView(i,80),N.textContent="Stable",M=!1,z.textContent="Resume Layout"}}),await ot(),u.onUpdate(it),await u.start(),M=!0,N.textContent="Running",z.textContent="Pause Layout",ht()}async function ot(){const e=u.getPositions();y.beginBatch(),x.beginBatch(),g.forEachNode(n=>{if(C.has(n.id))return;const t=e.get(n.id);t&&C.set(n.id,R(n,t))}),g.forEachLink(n=>{const t=`${n.fromId}-${n.toId}`;if(k.has(t))return;const a=e.get(n.fromId),s=e.get(n.toId);if(!a||!s)return;const c=x.add({id:t,fromX:a.x,fromY:a.y,toX:s.x,toY:s.y});k.set(t,{edge:c,link:n})}),y.endBatch(),x.endBatch()}function R(e,n){return y.add({id:e.id,x:n.x,y:n.y,data:{...e.data,degree:e.data.degree||0}})}function it(e){let n=!1;e.forEach((t,a)=>{let s=C.get(a);if(!s){const c=g.getNode(a);if(!c)return;n||(y.beginBatch(),x.beginBatch(),n=!0),s=R(c,t),C.set(a,s),g.forEachLinkedNode(a,(m,d)=>{const i=`${d.fromId}-${d.toId}`;if(k.has(i))return;const l=e.get(d.fromId),o=e.get(d.toId);if(!l||!o)return;const h=x.add({id:i,fromX:l.x,fromY:l.y,toX:o.x,toY:o.y});k.set(i,{edge:h,link:d})})}y.setPosition(s,t.x,t.y)}),n&&(y.endBatch(),x.endBatch()),T(e),v.requestRender()}function T(e){e||(e=u.getPositions()),k.forEach(({edge:n,link:t})=>{const a=e.get(t.fromId),s=e.get(t.toId);a&&s&&x.setEndpoints(n,a.x,a.y,s.x,s.y)})}function st(e){const n=e.hanzi.length;return{width:Math.max(50,n*16+20),height:36}}async function at(){const e=u.getPositions(),n=v.drawContext.transform.scale,a=Math.min(1,2/n),s=[],c=new Map;e.forEach((d,i)=>{const l=g.getNode(i);if(!l)return;c.set(i,{x:d.x,y:d.y});const o=st(l.data),h=g.getLinks(i),r=h?h.size??h.length??0:0;s.push({id:i,x:d.x,y:d.y,width:(o.width+8)*a,height:(o.height+8)*a,degree:r})}),K(s,c,{iterations:100,padding:4});const m=new Map;for(const d of s)m.set(d.id,{x:d.x,y:d.y});await ct(c,m,300)}function ct(e,n,t){return new Promise(a=>{const s=performance.now();function c(m){const d=m-s,i=Math.min(d/t,1),l=1-Math.pow(1-i,3),o=new Map;n.forEach((h,r)=>{const p=e.get(r)||h,f=p.x+(h.x-p.x)*l,w=p.y+(h.y-p.y)*l;o.set(r,{x:f,y:w});const E=C.get(r);E&&y.setPosition(E,f,w)}),T(o),v.requestRender(),i<1?requestAnimationFrame(c):(n.forEach((h,r)=>{u.setNodePosition(r,h.x,h.y)}),a())}requestAnimationFrame(c)})}function I(e){return{1:"#34c759",2:"#5ac8fa",3:"#007aff",4:"#5856d6",5:"#af52de",6:"#ff3b30"}[e]||"#8e8e93"}function dt(e){const n=document.createElementNS("http://www.w3.org/2000/svg","defs");n.innerHTML=`
    <filter id="card-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.1"/>
    </filter>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  `,e.insertBefore(n,e.firstChild)}function rt(){b.addEventListener("change",async()=>{await D(b.value,parseInt(S.value))}),S.addEventListener("input",()=>{_.textContent=S.value}),S.addEventListener("change",async()=>{await D(b.value,parseInt(S.value))}),j.addEventListener("click",async()=>{if(u){const e=await u.getBounds();v.fitToView(e,80)}}),z.addEventListener("click",()=>{M?(u.stop(),N.textContent="Paused",z.textContent="Resume Layout"):(u.start(),N.textContent="Running",z.textContent="Pause Layout"),M=!M}),tt.addEventListener("click",()=>{Y.classList.add("hidden")}),P.addEventListener("click",e=>{const n=e.target.closest(".node");if(n){for(const[t,a]of C)if(a._element===n){lt(t);break}}})}function lt(e){const n=g.getNode(e);if(!n)return;const t=n.data;document.getElementById("detailHanzi").textContent=t.hanzi,document.getElementById("detailPinyin").textContent=t.pinyin||"-",document.getElementById("detailDefinition").textContent=t.definition||"No definition available";const a=document.getElementById("detailHsk");t.hsk?(a.textContent=`HSK ${t.hsk}`,a.className=`word-hsk hsk-${t.hsk}`):(a.textContent="HSK ?",a.className="word-hsk hsk-unknown"),Y.classList.remove("hidden")}function ht(){U.textContent=y?y.count:0,J.textContent=x?x.count:0}nt();
