import{R as ge,c as me,C as ye,N as xe,F as pe}from"./ForceLayoutAdapter-KbGwD6E3.js";function we(t,n,e={}){const a=e.iterations??100,r=e.padding??4,c=new ge;for(let d=0;d<a;d++){c.clear();const h=t.map(g=>({minX:g.x-g.width/2,minY:g.y-g.height/2,maxX:g.x+g.width/2,maxY:g.y+g.height/2,rect:g}));c.load(h);let o=!1;const f=new Set;for(const g of h){const C=c.search({minX:g.minX-r,minY:g.minY-r,maxX:g.maxX+r,maxY:g.maxY+r});for(const y of C){if(y.rect===g.rect)continue;const E=[g.rect.id,y.rect.id];E.sort();const p=E[0]+"|"+E[1];f.has(p)||(f.add(p),ve(g.rect,y.rect,r)&&(o=!0))}}if(!o)break}const m=20,l=.1;for(let d=0;d<m;d++){c.clear();const h=t.map(o=>({minX:o.x-o.width/2,minY:o.y-o.height/2,maxX:o.x+o.width/2,maxY:o.y+o.height/2,rect:o}));c.load(h);for(const o of t){const f=n.get(o.id);if(!f)continue;const g=(f.x-o.x)*l,C=(f.y-o.y)*l;if(Math.abs(g)<.1&&Math.abs(C)<.1)continue;const y=o.x+g,E=o.y+C,p=c.search({minX:y-o.width/2-r,minY:E-o.height/2-r,maxX:y+o.width/2+r,maxY:E+o.height/2+r});let I=!0;for(const b of p){if(b.rect===o)continue;const W=o.width/2+b.rect.width/2+r-Math.abs(y-b.rect.x),H=o.height/2+b.rect.height/2+r-Math.abs(E-b.rect.y);if(W>0&&H>0){I=!1;break}}I&&(o.x=y,o.y=E)}}}function ve(t,n,e=0){const a=t.width/2+n.width/2+e-Math.abs(t.x-n.x),r=t.height/2+n.height/2+e-Math.abs(t.y-n.y);if(a<=0||r<=0)return!1;const c=1/(1+(t.degree||0)),m=1/(1+(n.degree||0)),l=c+m,d=c/l,h=m/l;if(a<r){const o=t.x>n.x?1:-1,f=a+.2;t.x+=f*o*d,n.x-=f*o*h}else{const o=t.y>n.y?1:-1,f=r+.2;t.y+=f*o*d,n.y-=f*o*h}return!0}function ke(t){Le(t);const n=Ee(t);return t.on=n.on,t.off=n.off,t.fire=n.fire,t}function Ee(t){let n=Object.create(null);return{on:function(e,a,r){if(typeof a!="function")throw new Error("callback is expected to be a function");let c=n[e];return c||(c=n[e]=[]),c.push({callback:a,ctx:r}),t},off:function(e,a){if(typeof e>"u")return n=Object.create(null),t;if(n[e])if(typeof a!="function")delete n[e];else{const m=n[e];for(let l=0;l<m.length;++l)m[l].callback===a&&m.splice(l,1)}return t},fire:function(e){const a=n[e];if(!a)return t;let r;arguments.length>1&&(r=Array.prototype.slice.call(arguments,1));for(let c=0;c<a.length;++c){const m=a[c];m.callback.apply(m.ctx,r)}return t}}}function Le(t){if(!t)throw new Error("Eventify cannot use falsy object as events subject");const n=["on","fire","off"];for(let e=0;e<n.length;++e)if(t.hasOwnProperty(n[e]))throw new Error("Subject cannot be eventified, since it already has property '"+n[e]+"'")}function Ce(t){if(t=t||{},"uniqueLinkId"in t&&(console.warn("ngraph.graph: Starting from version 0.14 `uniqueLinkId` is deprecated.\nUse `multigraph` option instead\n",`
`,`Note: there is also change in default behavior: From now on each graph
is considered to be not a multigraph by default (each edge is unique).`),t.multigraph=t.uniqueLinkId),t.multigraph===void 0&&(t.multigraph=!1),typeof Map!="function")throw new Error("ngraph.graph requires `Map` to be defined. Please polyfill it before using ngraph");var n=new Map,e=new Map,a={},r=0,c=t.multigraph?H:W,m=[],l=F,d=F,h=F,o=F,f={version:20,addNode:E,addLink:b,removeLink:oe,removeNode:I,getNode:p,getNodeCount:K,getLinkCount:U,getEdgeCount:U,getLinksCount:U,getNodesCount:K,getLinks:ie,forEachNode:J,forEachLinkedNode:de,forEachLink:se,beginUpdate:h,endUpdate:o,clear:ae,hasLink:D,hasNode:p,getLink:D,getLinkById:re};return ke(f),g(),f;function g(){var i=f.on;f.on=s;function s(){return f.beginUpdate=h=fe,f.endUpdate=o=he,l=C,d=y,f.on=i,i.apply(f,arguments)}}function C(i,s){m.push({link:i,changeType:s})}function y(i,s){m.push({node:i,changeType:s})}function E(i,s){if(i===void 0)throw new Error("Invalid node identifier");h();var u=p(i);return u?(u.data=s,d(u,"update")):(u=new Ne(i,s),d(u,"add")),n.set(i,u),o(),u}function p(i){return n.get(i)}function I(i){var s=p(i);if(!s)return!1;h();var u=s.links;return u&&(u.forEach(_),s.links=null),n.delete(i),d(s,"remove"),o(),!0}function b(i,s,u){h();var x=p(i)||E(i),L=p(s)||E(s),w=c(i,s,u),B=e.has(w.id);return e.set(w.id,w),Q(x,w),i!==s&&Q(L,w),l(w,B?"update":"add"),o(),w}function W(i,s,u){var x=X(i,s),L=e.get(x);return L?(L.data=u,L):new j(i,s,u,x)}function H(i,s,u){var x=X(i,s),L=a.hasOwnProperty(x);if(L||D(i,s)){L||(a[x]=0);var w="@"+ ++a[x];x=X(i+w,s+w)}return new j(i,s,u,x)}function K(){return n.size}function U(){return e.size}function ie(i){var s=p(i);return s?s.links:null}function oe(i,s){return s!==void 0&&(i=D(i,s)),_(i)}function _(i){if(!i||!e.get(i.id))return!1;h(),e.delete(i.id);var s=p(i.fromId),u=p(i.toId);return s&&s.links.delete(i),u&&u.links.delete(i),l(i,"remove"),o(),!0}function D(i,s){if(!(i===void 0||s===void 0))return e.get(X(i,s))}function re(i){if(i!==void 0)return e.get(i)}function ae(){h(),J(function(i){I(i.id)}),o()}function se(i){if(typeof i=="function")for(var s=e.values(),u=s.next();!u.done;){if(i(u.value))return!0;u=s.next()}}function de(i,s,u){var x=p(i);if(x&&x.links&&typeof s=="function")return u?le(x.links,i,s):ce(x.links,i,s)}function ce(i,s,u){for(var x,L=i.values(),w=L.next();!w.done;){var B=w.value,ue=B.fromId===s?B.toId:B.fromId;if(x=u(n.get(ue),B),x)return!0;w=L.next()}}function le(i,s,u){for(var x,L=i.values(),w=L.next();!w.done;){var B=w.value;if(B.fromId===s&&(x=u(n.get(B.toId),B),x))return!0;w=L.next()}}function F(){}function fe(){r+=1}function he(){r-=1,r===0&&m.length>0&&(f.fire("changed",m),m.length=0)}function J(i){if(typeof i!="function")throw new Error("Function is expected to iterate over graph nodes. You passed "+i);for(var s=n.values(),u=s.next();!u.done;){if(i(u.value))return!0;u=s.next()}}}function Ne(t,n){this.id=t,this.links=null,this.data=n}function Q(t,n){t.links?t.links.add(n):t.links=new Set([n])}function j(t,n,e,a){this.fromId=t,this.toId=n,this.data=e,this.id=a}function X(t,n){return t.toString()+"👉 "+n.toString()}const Z=document.getElementById("container"),O=document.getElementById("categorySelect"),$=document.getElementById("depthSlider"),Se=document.getElementById("depthValue"),Me=document.getElementById("btnReset"),q=document.getElementById("btnToggleLayout"),Be=document.getElementById("nodeCount"),be=document.getElementById("edgeCount"),ze=document.getElementById("zoomLevel"),T=document.getElementById("layoutStatus"),ee=document.getElementById("wordDetail"),$e=document.getElementById("closeDetail");let R=null,v=null,M=null,N=null,S=null,k=null,Y=!0,z=new Map,P=new Map;const Pe="./hypernym-dag-v2.json",A=document.createElement("div");A.className="loading";A.textContent="Loading vocabulary data";document.body.appendChild(A);async function Ie(){try{R=await(await fetch(Pe)).json(),A.remove(),M=me(Z,{viewBox:{left:-300,top:-300,right:300,bottom:300},panZoom:{minZoom:.1,maxZoom:50}}),S=new ye({container:Z,color:"#c7c7cc",width:1,opacity:.4});const n=e=>e.degree||0;N=new xe({maxScale:2,levels:[{type:"text",text:e=>e.hanzi,fontSize:10,fill:"#48484a",fontFamily:"'Noto Sans SC', -apple-system, sans-serif",fontWeight:"600"},{minZoom:.7,layers:[{type:"circle",radius:3,fill:e=>V(e.hsk),opacity:.3},{type:"text",text:e=>e.hanzi,fontSize:11,fill:"#1d1d1f",fontFamily:"'Noto Sans SC', -apple-system, sans-serif",fontWeight:"600"}]},{minZoom:1.7,importance:n,hitArea:{type:"rect",width:e=>Math.max(50,e.hanzi.length*16+20),height:36},layers:[{type:"render",render:(e,a)=>{const r=e.hanzi.length,c=Math.max(50,r*16+20);return`
                  <rect x="${-(c/2)}" y="-18" width="${c}" height="36" rx="6"
                    fill="white" stroke="#d2d2d7" stroke-width="1"/>
                  <text
                    y="${e.pinyin?-4:0}"
                    text-anchor="middle"
                    dominant-baseline="${e.pinyin?"auto":"central"}"
                    font-size="14"
                    font-weight="600"
                    fill="#1d1d1f"
                    font-family="'Noto Sans SC', -apple-system, sans-serif"
                  >${e.hanzi}</text>`}},{type:"text",text:e=>e.pinyin,fontSize:9,fill:"#86868b",anchor:"bottom",offset:[0,10],visible:e=>!!e.pinyin}]},{minZoom:4,importance:n,hitArea:{type:"rect",width:e=>Math.max(90,e.hanzi.length*20+30),height:64},layers:[{type:"render",render:(e,a)=>{const r=e.definition?e.definition.length>12?e.definition.slice(0,12)+"...":e.definition:"",c=V(e.hsk),m=e.hanzi.length,l=Math.max(90,m*20+30),d=l/2;return`
                  <rect x="${-d}" y="-32" width="${l}" height="64" rx="10"
                    fill="white" stroke="#d2d2d7" stroke-width="1.5"
                    filter="url(#card-shadow)"/>
                  ${e.hsk?`
                    <rect x="${d-22}" y="-28" width="18" height="14" rx="3" fill="${c}"/>
                    <text x="${d-13}" y="-18" text-anchor="middle" font-size="8" fill="white" font-weight="600">${e.hsk}</text>
                  `:""}
                  <text
                    y="-8"
                    text-anchor="middle"
                    font-size="18"
                    font-weight="700"
                    fill="#1d1d1f"
                    font-family="'Noto Sans SC', -apple-system, sans-serif"
                  >${e.hanzi}</text>
                  ${e.pinyin?`
                    <text
                      y="8"
                      text-anchor="middle"
                      font-size="11"
                      fill="#0071e3"
                      font-weight="500"
                      font-family="-apple-system, sans-serif"
                    >${e.pinyin}</text>
                  `:""}
                  ${r?`
                    <text
                      y="22"
                      text-anchor="middle"
                      font-size="9"
                      fill="#86868b"
                      font-family="-apple-system, sans-serif"
                    >${r}</text>
                  `:""}`}}]},{minZoom:8,importance:n,hitArea:{type:"rect",width:e=>Math.max(130,e.hanzi.length*28+40),height:90},layers:[{type:"render",render:(e,a)=>{const r=V(e.hsk),c=e.definition||"",m=e.hanzi.length,l=Math.max(130,m*28+40),d=l/2,h=c.length>18?c.slice(0,18)+"...":c;return`
                  <rect x="${-d}" y="-45" width="${l}" height="90" rx="12"
                    fill="white" stroke="#d2d2d7" stroke-width="1.5"
                    filter="url(#card-shadow)"/>
                  ${e.hsk?`
                    <rect x="${d-28}" y="-40" width="24" height="16" rx="4" fill="${r}"/>
                    <text x="${d-16}" y="-28" text-anchor="middle" font-size="10" fill="white" font-weight="600">HSK${e.hsk}</text>
                  `:""}
                  <text
                    y="-14"
                    text-anchor="middle"
                    font-size="26"
                    font-weight="700"
                    fill="#1d1d1f"
                    font-family="'Noto Sans SC', -apple-system, sans-serif"
                  >${e.hanzi}</text>
                  ${e.pinyin?`
                    <text
                      y="6"
                      text-anchor="middle"
                      font-size="14"
                      fill="#0071e3"
                      font-weight="500"
                      font-family="-apple-system, sans-serif"
                    >${e.pinyin}</text>
                  `:""}
                  ${c?`
                    <text
                      y="26"
                      text-anchor="middle"
                      font-size="11"
                      fill="#48484a"
                      font-family="-apple-system, sans-serif"
                    >${h}</text>
                  `:""}`}}]}]}),M.addCollection(S),M.addCollection(N),De(M.svg),await G(O.value,parseInt($.value)),M.on("transform",e=>{ze.textContent=e.scale.toFixed(2)+"x"}),Fe()}catch(t){console.error("Failed to initialize:",t),A.textContent="Failed to load data: "+t.message}}async function G(t,n){var r,c,m,l;k&&(k.stop(),k.dispose()),N&&N.clear(),S&&S.clear(),z.clear(),P.clear(),v=Ce();const e=new Set,a=[{word:t,depth:0}];for(e.add(t);a.length>0;){const{word:d,depth:h}=a.shift(),o=((r=R.wordInfo)==null?void 0:r[d])||{},f=((c=R.definitions)==null?void 0:c[d])||"",g=((m=R.freq)==null?void 0:m[d])||0;if(v.addNode(d,{hanzi:d,pinyin:o.pinyin||"",hsk:o.hsk||null,definition:f,freq:g,depth:h}),h<n){const C=((l=R.children)==null?void 0:l[d])||[];for(const y of C)e.has(y)?v.hasNode(y)&&(v.hasLink(d,y)||v.addLink(d,y)):(e.add(y),a.push({word:y,depth:h+1}),v.addLink(d,y))}}v.forEachNode(d=>{const h=v.getLinks(d.id),o=h?h.size??h.length??0:0;d.data.degree=o}),k=new pe(v,{springLength:50,springCoefficient:4e-4,gravity:-1.5,energyThreshold:.5,onStabilized:async()=>{let d=await k.getBounds();await M.fitToView(d,80),T.textContent="Removing overlaps...",await Ye(),d=await k.getBounds(),await M.fitToView(d,80),T.textContent="Stable",Y=!1,q.textContent="Resume Layout"}}),await Re(),k.onUpdate(qe),await k.start(),Y=!0,T.textContent="Running",q.textContent="Pause Layout",Oe()}async function Re(){const t=k.getPositions();N.beginBatch(),S.beginBatch(),v.forEachNode(n=>{if(z.has(n.id))return;const e=t.get(n.id);e&&z.set(n.id,te(n,e))}),v.forEachLink(n=>{const e=`${n.fromId}-${n.toId}`;if(P.has(e))return;const a=t.get(n.fromId),r=t.get(n.toId);if(!a||!r)return;const c=S.add({id:e,fromX:a.x,fromY:a.y,toX:r.x,toY:r.y});P.set(e,{edge:c,link:n})}),N.endBatch(),S.endBatch()}function te(t,n){return N.add({id:t.id,x:n.x,y:n.y,data:{...t.data,degree:t.data.degree||0}})}function qe(t){let n=!1;t.forEach((e,a)=>{let r=z.get(a);if(!r){const c=v.getNode(a);if(!c)return;n||(N.beginBatch(),S.beginBatch(),n=!0),r=te(c,e),z.set(a,r),v.forEachLinkedNode(a,(m,l)=>{const d=`${l.fromId}-${l.toId}`;if(P.has(d))return;const h=t.get(l.fromId),o=t.get(l.toId);if(!h||!o)return;const f=S.add({id:d,fromX:h.x,fromY:h.y,toX:o.x,toY:o.y});P.set(d,{edge:f,link:l})})}N.setPosition(r,e.x,e.y)}),n&&(N.endBatch(),S.endBatch()),ne(t),M.requestRender()}function ne(t){t||(t=k.getPositions()),P.forEach(({edge:n,link:e})=>{const a=t.get(e.fromId),r=t.get(e.toId);a&&r&&S.setEndpoints(n,a.x,a.y,r.x,r.y)})}function Te(t){const n=t.hanzi.length;return{width:Math.max(50,n*16+20),height:36}}async function Ye(){const t=k.getPositions(),n=M.drawContext.transform.scale,a=Math.min(1,2/n),r=[],c=new Map;t.forEach((l,d)=>{const h=v.getNode(d);if(!h)return;c.set(d,{x:l.x,y:l.y});const o=Te(h.data),f=v.getLinks(d),g=f?f.size??f.length??0:0;r.push({id:d,x:l.x,y:l.y,width:(o.width+8)*a,height:(o.height+8)*a,degree:g})}),we(r,c,{iterations:100,padding:4});const m=new Map;for(const l of r)m.set(l.id,{x:l.x,y:l.y});await Ae(c,m,300)}function Ae(t,n,e){return new Promise(a=>{const r=performance.now();function c(m){const l=m-r,d=Math.min(l/e,1),h=1-Math.pow(1-d,3),o=new Map;n.forEach((f,g)=>{const C=t.get(g)||f,y=C.x+(f.x-C.x)*h,E=C.y+(f.y-C.y)*h;o.set(g,{x:y,y:E});const p=z.get(g);p&&N.setPosition(p,y,E)}),ne(o),M.requestRender(),d<1?requestAnimationFrame(c):(n.forEach((f,g)=>{k.setNodePosition(g,f.x,f.y)}),a())}requestAnimationFrame(c)})}function V(t){return{1:"#34c759",2:"#5ac8fa",3:"#007aff",4:"#5856d6",5:"#af52de",6:"#ff3b30"}[t]||"#8e8e93"}function De(t){const n=document.createElementNS("http://www.w3.org/2000/svg","defs");n.innerHTML=`
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
  `,t.insertBefore(n,t.firstChild)}function Fe(){O.addEventListener("change",async()=>{await G(O.value,parseInt($.value))}),$.addEventListener("input",()=>{Se.textContent=$.value}),$.addEventListener("change",async()=>{await G(O.value,parseInt($.value))}),Me.addEventListener("click",async()=>{if(k){const t=await k.getBounds();M.fitToView(t,80)}}),q.addEventListener("click",()=>{Y?(k.stop(),T.textContent="Paused",q.textContent="Resume Layout"):(k.start(),T.textContent="Running",q.textContent="Pause Layout"),Y=!Y}),$e.addEventListener("click",()=>{ee.classList.add("hidden")}),Z.addEventListener("click",t=>{const n=t.target.closest(".node");if(n){for(const[e,a]of z)if(a._element===n){Xe(e);break}}})}function Xe(t){const n=v.getNode(t);if(!n)return;const e=n.data;document.getElementById("detailHanzi").textContent=e.hanzi,document.getElementById("detailPinyin").textContent=e.pinyin||"-",document.getElementById("detailDefinition").textContent=e.definition||"No definition available";const a=document.getElementById("detailHsk");e.hsk?(a.textContent=`HSK ${e.hsk}`,a.className=`word-hsk hsk-${e.hsk}`):(a.textContent="HSK ?",a.className="word-hsk hsk-unknown"),ee.classList.remove("hidden")}function Oe(){Be.textContent=N?N.count:0,be.textContent=S?S.count:0}Ie();
