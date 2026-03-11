import{r as $e,g as Ce}from"./index-BzRJ2RaR.js";function qe(p,a){for(var f=0;f<a.length;f++){const n=a[f];if(typeof n!="string"&&!Array.isArray(n)){for(const r in n)if(r!=="default"&&!(r in p)){const i=Object.getOwnPropertyDescriptor(n,r);i&&Object.defineProperty(p,r,i.get?i:{enumerable:!0,get:()=>n[r]})}}}return Object.freeze(Object.defineProperty(p,Symbol.toStringTag,{value:"Module"}))}var V={exports:{}},L={exports:{}},H,oe;function be(){return oe||(oe=1,H=function(a){return a===0?"x":a===1?"y":a===2?"z":"c"+(a+1)}),H}var K,ie;function O(){if(ie)return K;ie=1;const p=be();return K=function(f){return n;function n(r,i){let u=i&&i.indent||0,h=i&&i.join!==void 0?i.join:`
`,c=Array(u+1).join(" "),v=[];for(let e=0;e<f;++e){let m=p(e),l=e===0?"":c;v.push(l+r.replace(/{var}/g,m))}return v.join(h)}},K}var ae;function Fe(){if(ae)return L.exports;ae=1;const p=O();L.exports=a,L.exports.generateCreateBodyFunctionBody=f,L.exports.getVectorCode=r,L.exports.getBodyCode=n;function a(i,u){let h=f(i,u),{Body:c}=new Function(h)();return c}function f(i,u){return`
${r(i,u)}
${n(i)}
return {Body: Body, Vector: Vector};
`}function n(i){let u=p(i),h=u("{var}",{join:", "});return`
function Body(${h}) {
  this.isPinned = false;
  this.pos = new Vector(${h});
  this.force = new Vector();
  this.velocity = new Vector();
  this.mass = 1;

  this.springCount = 0;
  this.springLength = 0;
}

Body.prototype.reset = function() {
  this.force.reset();
  this.springCount = 0;
  this.springLength = 0;
}

Body.prototype.setPosition = function (${h}) {
  ${u("this.pos.{var} = {var} || 0;",{indent:2})}
};`}function r(i,u){let h=p(i),c="";return u&&(c=`${h(`
	   var v{var};
	Object.defineProperty(this, '{var}', {
	  set: function(v) { 
	    if (!Number.isFinite(v)) throw new Error('Cannot set non-numbers to {var}');
	    v{var} = v; 
	  },
	  get: function() { return v{var}; }
	});`)}`),`function Vector(${h("{var}",{join:", "})}) {
  ${c}
    if (typeof arguments[0] === 'object') {
      // could be another vector
      let v = arguments[0];
      ${h('if (!Number.isFinite(v.{var})) throw new Error("Expected value is not a finite number at Vector constructor ({var})");',{indent:4})}
      ${h("this.{var} = v.{var};",{indent:4})}
    } else {
      ${h('this.{var} = typeof {var} === "number" ? {var} : 0;',{indent:4})}
    }
  }
  
  Vector.prototype.reset = function () {
    ${h("this.{var} = ",{join:""})}0;
  };`}return L.exports}var _={exports:{}},de;function Se(){if(de)return _.exports;de=1;const p=O(),a=be();_.exports=f,_.exports.generateQuadTreeFunctionBody=n,_.exports.getInsertStackCode=c,_.exports.getQuadNodeCode=h,_.exports.isSamePosition=r,_.exports.getChildBodyCode=u,_.exports.setChildBodyCode=i;function f(v){let e=n(v);return new Function(e)()}function n(v){let e=p(v),m=Math.pow(2,v);return`
${c()}
${h(v)}
${r(v)}
${u(v)}
${i(v)}

function createQuadTree(options, random) {
  options = options || {};
  options.gravity = typeof options.gravity === 'number' ? options.gravity : -1;
  options.theta = typeof options.theta === 'number' ? options.theta : 0.8;

  var gravity = options.gravity;
  var updateQueue = [];
  var insertStack = new InsertStack();
  var theta = options.theta;

  var nodesCache = [];
  var currentInCache = 0;
  var root = newNode();

  return {
    insertBodies: insertBodies,

    /**
     * Gets root node if it is present
     */
    getRoot: function() {
      return root;
    },

    updateBodyForce: update,

    options: function(newOptions) {
      if (newOptions) {
        if (typeof newOptions.gravity === 'number') {
          gravity = newOptions.gravity;
        }
        if (typeof newOptions.theta === 'number') {
          theta = newOptions.theta;
        }

        return this;
      }

      return {
        gravity: gravity,
        theta: theta
      };
    }
  };

  function newNode() {
    // To avoid pressure on GC we reuse nodes.
    var node = nodesCache[currentInCache];
    if (node) {
${C("      node.")}
      node.body = null;
      node.mass = ${e("node.mass_{var} = ",{join:""})}0;
      ${e("node.min_{var} = node.max_{var} = ",{join:""})}0;
    } else {
      node = new QuadNode();
      nodesCache[currentInCache] = node;
    }

    ++currentInCache;
    return node;
  }

  function update(sourceBody) {
    var queue = updateQueue;
    var v;
    ${e("var d{var};",{indent:4})}
    var r; 
    ${e("var f{var} = 0;",{indent:4})}
    var queueLength = 1;
    var shiftIdx = 0;
    var pushIdx = 1;

    queue[0] = root;

    while (queueLength) {
      var node = queue[shiftIdx];
      var body = node.body;

      queueLength -= 1;
      shiftIdx += 1;
      var differentBody = (body !== sourceBody);
      if (body && differentBody) {
        // If the current node is a leaf node (and it is not source body),
        // calculate the force exerted by the current node on body, and add this
        // amount to body's net force.
        ${e("d{var} = body.pos.{var} - sourceBody.pos.{var};",{indent:8})}
        r = Math.sqrt(${e("d{var} * d{var}",{join:" + "})});

        if (r === 0) {
          // Poor man's protection against zero distance.
          ${e("d{var} = (random.nextDouble() - 0.5) / 50;",{indent:10})}
          r = Math.sqrt(${e("d{var} * d{var}",{join:" + "})});
        }

        // This is standard gravitation force calculation but we divide
        // by r^3 to save two operations when normalizing force vector.
        v = gravity * body.mass * sourceBody.mass / (r * r * r);
        ${e("f{var} += v * d{var};",{indent:8})}
      } else if (differentBody) {
        // Otherwise, calculate the ratio s / r,  where s is the width of the region
        // represented by the internal node, and r is the distance between the body
        // and the node's center-of-mass
        ${e("d{var} = node.mass_{var} / node.mass - sourceBody.pos.{var};",{indent:8})}
        r = Math.sqrt(${e("d{var} * d{var}",{join:" + "})});

        if (r === 0) {
          // Sorry about code duplication. I don't want to create many functions
          // right away. Just want to see performance first.
          ${e("d{var} = (random.nextDouble() - 0.5) / 50;",{indent:10})}
          r = Math.sqrt(${e("d{var} * d{var}",{join:" + "})});
        }
        // If s / r < θ, treat this internal node as a single body, and calculate the
        // force it exerts on sourceBody, and add this amount to sourceBody's net force.
        if ((node.max_${a(0)} - node.min_${a(0)}) / r < theta) {
          // in the if statement above we consider node's width only
          // because the region was made into square during tree creation.
          // Thus there is no difference between using width or height.
          v = gravity * node.mass * sourceBody.mass / (r * r * r);
          ${e("f{var} += v * d{var};",{indent:10})}
        } else {
          // Otherwise, run the procedure recursively on each of the current node's children.

          // I intentionally unfolded this loop, to save several CPU cycles.
${y()}
        }
      }
    }

    ${e("sourceBody.force.{var} += f{var};",{indent:4})}
  }

  function insertBodies(bodies) {
    ${e("var {var}min = Number.MAX_VALUE;",{indent:4})}
    ${e("var {var}max = Number.MIN_VALUE;",{indent:4})}
    var i = bodies.length;

    // To reduce quad tree depth we are looking for exact bounding box of all particles.
    while (i--) {
      var pos = bodies[i].pos;
      ${e("if (pos.{var} < {var}min) {var}min = pos.{var};",{indent:6})}
      ${e("if (pos.{var} > {var}max) {var}max = pos.{var};",{indent:6})}
    }

    // Makes the bounds square.
    var maxSideLength = -Infinity;
    ${e("if ({var}max - {var}min > maxSideLength) maxSideLength = {var}max - {var}min ;",{indent:4})}

    currentInCache = 0;
    root = newNode();
    ${e("root.min_{var} = {var}min;",{indent:4})}
    ${e("root.max_{var} = {var}min + maxSideLength;",{indent:4})}

    i = bodies.length - 1;
    if (i >= 0) {
      root.body = bodies[i];
    }
    while (i--) {
      insert(bodies[i], root);
    }
  }

  function insert(newBody) {
    insertStack.reset();
    insertStack.push(root, newBody);

    while (!insertStack.isEmpty()) {
      var stackItem = insertStack.pop();
      var node = stackItem.node;
      var body = stackItem.body;

      if (!node.body) {
        // This is internal node. Update the total mass of the node and center-of-mass.
        ${e("var {var} = body.pos.{var};",{indent:8})}
        node.mass += body.mass;
        ${e("node.mass_{var} += body.mass * {var};",{indent:8})}

        // Recursively insert the body in the appropriate quadrant.
        // But first find the appropriate quadrant.
        var quadIdx = 0; // Assume we are in the 0's quad.
        ${e("var min_{var} = node.min_{var};",{indent:8})}
        ${e("var max_{var} = (min_{var} + node.max_{var}) / 2;",{indent:8})}

${g(8)}

        var child = getChild(node, quadIdx);

        if (!child) {
          // The node is internal but this quadrant is not taken. Add
          // subnode to it.
          child = newNode();
          ${e("child.min_{var} = min_{var};",{indent:10})}
          ${e("child.max_{var} = max_{var};",{indent:10})}
          child.body = body;

          setChild(node, quadIdx, child);
        } else {
          // continue searching in this quadrant.
          insertStack.push(child, body);
        }
      } else {
        // We are trying to add to the leaf node.
        // We have to convert current leaf into internal node
        // and continue adding two nodes.
        var oldBody = node.body;
        node.body = null; // internal nodes do not cary bodies

        if (isSamePosition(oldBody.pos, body.pos)) {
          // Prevent infinite subdivision by bumping one node
          // anywhere in this quadrant
          var retriesCount = 3;
          do {
            var offset = random.nextDouble();
            ${e("var d{var} = (node.max_{var} - node.min_{var}) * offset;",{indent:12})}

            ${e("oldBody.pos.{var} = node.min_{var} + d{var};",{indent:12})}
            retriesCount -= 1;
            // Make sure we don't bump it out of the box. If we do, next iteration should fix it
          } while (retriesCount > 0 && isSamePosition(oldBody.pos, body.pos));

          if (retriesCount === 0 && isSamePosition(oldBody.pos, body.pos)) {
            // This is very bad, we ran out of precision.
            // if we do not return from the method we'll get into
            // infinite loop here. So we sacrifice correctness of layout, and keep the app running
            // Next layout iteration should get larger bounding box in the first step and fix this
            return;
          }
        }
        // Next iteration should subdivide node further.
        insertStack.push(node, oldBody);
        insertStack.push(node, body);
      }
    }
  }
}
return createQuadTree;

`;function g($){let x=[],w=Array($+1).join(" ");for(let F=0;F<v;++F)x.push(w+`if (${a(F)} > max_${a(F)}) {`),x.push(w+`  quadIdx = quadIdx + ${Math.pow(2,F)};`),x.push(w+`  min_${a(F)} = max_${a(F)};`),x.push(w+`  max_${a(F)} = node.max_${a(F)};`),x.push(w+"}");return x.join(`
`)}function y(){let $=Array(11).join(" "),x=[];for(let w=0;w<m;++w)x.push($+`if (node.quad${w}) {`),x.push($+`  queue[pushIdx] = node.quad${w};`),x.push($+"  queueLength += 1;"),x.push($+"  pushIdx += 1;"),x.push($+"}");return x.join(`
`)}function C($){let x=[];for(let w=0;w<m;++w)x.push(`${$}quad${w} = null;`);return x.join(`
`)}}function r(v){let e=p(v);return`
  function isSamePosition(point1, point2) {
    ${e("var d{var} = Math.abs(point1.{var} - point2.{var});",{indent:2})}
  
    return ${e("d{var} < 1e-8",{join:" && "})};
  }  
`}function i(v){var e=Math.pow(2,v);return`
function setChild(node, idx, child) {
  ${m()}
}`;function m(){let l=[];for(let g=0;g<e;++g){let y=g===0?"  ":"  else ";l.push(`${y}if (idx === ${g}) node.quad${g} = child;`)}return l.join(`
`)}}function u(v){return`function getChild(node, idx) {
${e()}
  return null;
}`;function e(){let m=[],l=Math.pow(2,v);for(let g=0;g<l;++g)m.push(`  if (idx === ${g}) return node.quad${g};`);return m.join(`
`)}}function h(v){let e=p(v),m=Math.pow(2,v);var l=`
function QuadNode() {
  // body stored inside this node. In quad tree only leaf nodes (by construction)
  // contain bodies:
  this.body = null;

  // Child nodes are stored in quads. Each quad is presented by number:
  // 0 | 1
  // -----
  // 2 | 3
${g("  this.")}

  // Total mass of current node
  this.mass = 0;

  // Center of mass coordinates
  ${e("this.mass_{var} = 0;",{indent:2})}

  // bounding box coordinates
  ${e("this.min_{var} = 0;",{indent:2})}
  ${e("this.max_{var} = 0;",{indent:2})}
}
`;return l;function g(y){let C=[];for(let $=0;$<m;++$)C.push(`${y}quad${$} = null;`);return C.join(`
`)}}function c(){return`
/**
 * Our implementation of QuadTree is non-recursive to avoid GC hit
 * This data structure represent stack of elements
 * which we are trying to insert into quad tree.
 */
function InsertStack () {
    this.stack = [];
    this.popIdx = 0;
}

InsertStack.prototype = {
    isEmpty: function() {
        return this.popIdx === 0;
    },
    push: function (node, body) {
        var item = this.stack[this.popIdx];
        if (!item) {
            // we are trying to avoid memory pressure: create new element
            // only when absolutely necessary
            this.stack[this.popIdx] = new InsertStackElement(node, body);
        } else {
            item.node = node;
            item.body = body;
        }
        ++this.popIdx;
    },
    pop: function () {
        if (this.popIdx > 0) {
            return this.stack[--this.popIdx];
        }
    },
    reset: function () {
        this.popIdx = 0;
    }
};

function InsertStackElement(node, body) {
    this.node = node; // QuadTree node
    this.body = body; // physical body which needs to be inserted to node
}
`}return _.exports}var A={exports:{}},se;function _e(){if(se)return A.exports;se=1,A.exports=a,A.exports.generateFunctionBody=f;const p=O();function a(n){let r=f(n);return new Function("bodies","settings","random",r)}function f(n){let r=p(n);return`
  var boundingBox = {
    ${r("min_{var}: 0, max_{var}: 0,",{indent:4})}
  };

  return {
    box: boundingBox,

    update: updateBoundingBox,

    reset: resetBoundingBox,

    getBestNewPosition: function (neighbors) {
      var ${r("base_{var} = 0",{join:", "})};

      if (neighbors.length) {
        for (var i = 0; i < neighbors.length; ++i) {
          let neighborPos = neighbors[i].pos;
          ${r("base_{var} += neighborPos.{var};",{indent:10})}
        }

        ${r("base_{var} /= neighbors.length;",{indent:8})}
      } else {
        ${r("base_{var} = (boundingBox.min_{var} + boundingBox.max_{var}) / 2;",{indent:8})}
      }

      var springLength = settings.springLength;
      return {
        ${r("{var}: base_{var} + (random.nextDouble() - 0.5) * springLength,",{indent:8})}
      };
    }
  };

  function updateBoundingBox() {
    var i = bodies.length;
    if (i === 0) return; // No bodies - no borders.

    ${r("var max_{var} = -Infinity;",{indent:4})}
    ${r("var min_{var} = Infinity;",{indent:4})}

    while(i--) {
      // this is O(n), it could be done faster with quadtree, if we check the root node bounds
      var bodyPos = bodies[i].pos;
      ${r("if (bodyPos.{var} < min_{var}) min_{var} = bodyPos.{var};",{indent:6})}
      ${r("if (bodyPos.{var} > max_{var}) max_{var} = bodyPos.{var};",{indent:6})}
    }

    ${r("boundingBox.min_{var} = min_{var};",{indent:4})}
    ${r("boundingBox.max_{var} = max_{var};",{indent:4})}
  }

  function resetBoundingBox() {
    ${r("boundingBox.min_{var} = boundingBox.max_{var} = 0;",{indent:4})}
  }
`}return A.exports}var D={exports:{}},ue;function Pe(){if(ue)return D.exports;ue=1;const p=O();D.exports=a,D.exports.generateCreateDragForceFunctionBody=f;function a(n){let r=f(n);return new Function("options",r)}function f(n){return`
  if (!Number.isFinite(options.dragCoefficient)) throw new Error('dragCoefficient is not a finite number');

  return {
    update: function(body) {
      ${p(n)("body.force.{var} -= options.dragCoefficient * body.velocity.{var};",{indent:6})}
    }
  };
`}return D.exports}var R={exports:{}},ce;function Ne(){if(ce)return R.exports;ce=1;const p=O();R.exports=a,R.exports.generateCreateSpringForceFunctionBody=f;function a(n){let r=f(n);return new Function("options","random",r)}function f(n){let r=p(n);return`
  if (!Number.isFinite(options.springCoefficient)) throw new Error('Spring coefficient is not a number');
  if (!Number.isFinite(options.springLength)) throw new Error('Spring length is not a number');

  return {
    /**
     * Updates forces acting on a spring
     */
    update: function (spring) {
      var body1 = spring.from;
      var body2 = spring.to;
      var length = spring.length < 0 ? options.springLength : spring.length;
      ${r("var d{var} = body2.pos.{var} - body1.pos.{var};",{indent:6})}
      var r = Math.sqrt(${r("d{var} * d{var}",{join:" + "})});

      if (r === 0) {
        ${r("d{var} = (random.nextDouble() - 0.5) / 50;",{indent:8})}
        r = Math.sqrt(${r("d{var} * d{var}",{join:" + "})});
      }

      var d = r - length;
      var coefficient = ((spring.coefficient > 0) ? spring.coefficient : options.springCoefficient) * d / r;

      ${r("body1.force.{var} += coefficient * d{var}",{indent:6})};
      body1.springCount += 1;
      body1.springLength += r;

      ${r("body2.force.{var} -= coefficient * d{var}",{indent:6})};
      body2.springCount += 1;
      body2.springLength += r;
    }
  };
`}return R.exports}var W={exports:{}},fe;function Ie(){if(fe)return W.exports;fe=1;const p=O();W.exports=a,W.exports.generateIntegratorFunctionBody=f;function a(n){let r=f(n);return new Function("bodies","timeStep","adaptiveTimeStepWeight",r)}function f(n){let r=p(n);return`
  var length = bodies.length;
  if (length === 0) return 0;

  ${r("var d{var} = 0, t{var} = 0;",{indent:2})}

  for (var i = 0; i < length; ++i) {
    var body = bodies[i];
    if (body.isPinned) continue;

    if (adaptiveTimeStepWeight && body.springCount) {
      timeStep = (adaptiveTimeStepWeight * body.springLength/body.springCount);
    }

    var coeff = timeStep / body.mass;

    ${r("body.velocity.{var} += coeff * body.force.{var};",{indent:4})}
    ${r("var v{var} = body.velocity.{var};",{indent:4})}
    var v = Math.sqrt(${r("v{var} * v{var}",{join:" + "})});

    if (v > 1) {
      // We normalize it so that we move within timeStep range. 
      // for the case when v <= 1 - we let velocity to fade out.
      ${r("body.velocity.{var} = v{var} / v;",{indent:6})}
    }

    ${r("d{var} = timeStep * body.velocity.{var};",{indent:4})}

    ${r("body.pos.{var} += d{var};",{indent:4})}

    ${r("t{var} += Math.abs(d{var});",{indent:4})}
  }

  return (${r("t{var} * t{var}",{join:" + "})})/length;
`}return W.exports}var Y,ve;function je(){if(ve)return Y;ve=1,Y=p;function p(a,f,n,r){this.from=a,this.to=f,this.length=n,this.coefficient=r}return Y}var Z,pe;function Me(){if(pe)return Z;pe=1,Z=p;function p(a,f){var n;if(a||(a={}),f){for(n in f)if(f.hasOwnProperty(n)){var r=a.hasOwnProperty(n),i=typeof f[n],u=!r||typeof a[n]!==i;u?a[n]=f[n]:i==="object"&&(a[n]=p(a[n],f[n]))}}return a}return Z}var ee,he;function me(){if(he)return ee;he=1;function p(n){f(n);const r=a(n);return n.on=r.on,n.off=r.off,n.fire=r.fire,n}function a(n){let r=Object.create(null);return{on:function(i,u,h){if(typeof u!="function")throw new Error("callback is expected to be a function");let c=r[i];return c||(c=r[i]=[]),c.push({callback:u,ctx:h}),n},off:function(i,u){if(typeof i>"u")return r=Object.create(null),n;if(r[i])if(typeof u!="function")delete r[i];else{const h=r[i];for(let c=0;c<h.length;++c)h[c].callback===u&&h.splice(c,1)}return n},fire:function(i){const u=r[i];if(!u)return n;let h;arguments.length>1&&(h=Array.prototype.slice.call(arguments,1));for(let c=0;c<u.length;++c){const v=u[c];v.callback.apply(v.ctx,h)}return n}}}function f(n){if(!n)throw new Error("Eventify cannot use falsy object as events subject");const r=["on","fire","off"];for(let i=0;i<r.length;++i)if(n.hasOwnProperty(r[i]))throw new Error("Subject cannot be eventified, since it already has property '"+r[i]+"'")}return ee=p,ee}var re,le;function ge(){if(le)return re;le=1,re=h;var p=Fe(),a=Se(),f=_e(),n=Pe(),r=Ne(),i=Ie(),u={};function h(e){var m=je(),l=Me(),g=me();if(e){if(e.springCoeff!==void 0)throw new Error("springCoeff was renamed to springCoefficient");if(e.dragCoeff!==void 0)throw new Error("dragCoeff was renamed to dragCoefficient")}e=l(e,{springLength:10,springCoefficient:.8,gravity:-12,theta:.8,dragCoefficient:.9,timeStep:.5,adaptiveTimeStepWeight:0,dimensions:2,debug:!1});var y=u[e.dimensions];if(!y){var C=e.dimensions;y={Body:p(C,e.debug),createQuadTree:a(C),createBounds:f(C),createDragForce:n(C),createSpringForce:r(C),integrate:i(C)},u[C]=y}var $=y.Body,x=y.createQuadTree,w=y.createBounds,F=y.createDragForce,z=y.createSpringForce,G=y.integrate,U=d=>new $(d),P=$e().random(42),q=[],S=[],N=x(e,P),T=w(q,e,P),I=z(e,P),J=F(e),k=0,j=[],M=new Map,t=0;B("nbody",Be),B("spring",we);var o={bodies:q,quadTree:N,springs:S,settings:e,addForce:B,removeForce:E,getForces:Q,step:function(){for(var d=0;d<j.length;++d)j[d](t);var b=G(q,e.timeStep,e.adaptiveTimeStepWeight);return t+=1,b},addBody:function(d){if(!d)throw new Error("Body is required");return q.push(d),d},addBodyAt:function(d){if(!d)throw new Error("Body position is required");var b=U(d);return q.push(b),b},removeBody:function(d){if(d){var b=q.indexOf(d);if(!(b<0))return q.splice(b,1),q.length===0&&T.reset(),!0}},addSpring:function(d,b,X,te){if(!d||!b)throw new Error("Cannot add null spring to force simulator");typeof X!="number"&&(X=-1);var ne=new m(d,b,X,te>=0?te:-1);return S.push(ne),ne},getTotalMovement:function(){return k},removeSpring:function(d){if(d){var b=S.indexOf(d);if(b>-1)return S.splice(b,1),!0}},getBestNewBodyPosition:function(d){return T.getBestNewPosition(d)},getBBox:s,getBoundingBox:s,invalidateBBox:function(){console.warn("invalidateBBox() is deprecated, bounds always recomputed on `getBBox()` call")},gravity:function(d){return d!==void 0?(e.gravity=d,N.options({gravity:d}),this):e.gravity},theta:function(d){return d!==void 0?(e.theta=d,N.options({theta:d}),this):e.theta},random:P};return c(e,o),g(o),o;function s(){return T.update(),T.box}function B(d,b){if(M.has(d))throw new Error("Force "+d+" is already added");M.set(d,b),j.push(b)}function E(d){var b=j.indexOf(M.get(d));b<0||(j.splice(b,1),M.delete(d))}function Q(){return M}function Be(){if(q.length!==0){N.insertBodies(q);for(var d=q.length;d--;){var b=q[d];b.isPinned||(b.reset(),N.updateBodyForce(b),J.update(b))}}}function we(){for(var d=S.length;d--;)I.update(S[d])}}function c(e,m){for(var l in e)v(e,m,l)}function v(e,m,l){if(e.hasOwnProperty(l)&&typeof m[l]!="function"){var g=Number.isFinite(e[l]);g?m[l]=function(y){if(y!==void 0){if(!Number.isFinite(y))throw new Error("Value of "+l+" should be a valid number.");return e[l]=y,m}return e[l]}:m[l]=function(y){return y!==void 0?(e[l]=y,m):e[l]}}}return re}var ye;function Ee(){if(ye)return V.exports;ye=1,V.exports=a,V.exports.simulator=ge();var p=me();function a(n,r){if(!n)throw new Error("Graph structure cannot be undefined");var i=r&&r.createSimulator||ge(),u=i(r);if(Array.isArray(r))throw new Error("Physics settings is expected to be an object");var h=n.version>19?M:j;r&&typeof r.nodeMass=="function"&&(h=r.nodeMass);var c=new Map,v={},e=0,m=u.settings.springTransform||f;U(),F();var l=!1,g={step:function(){if(e===0)return y(!0),!0;var t=u.step();g.lastMove=t,g.fire("step");var o=t/e,s=o<=.01;return y(s),s},getNodePosition:function(t){return k(t).pos},setNodePosition:function(t){var o=k(t);o.setPosition.apply(o,Array.prototype.slice.call(arguments,1))},getLinkPosition:function(t){var o=v[t];if(o)return{from:o.from.pos,to:o.to.pos}},getGraphRect:function(){return u.getBBox()},forEachBody:C,pinNode:function(t,o){var s=k(t.id);s.isPinned=!!o},isNodePinned:function(t){return k(t.id).isPinned},dispose:function(){n.off("changed",G),g.fire("disposed")},getBody:w,getSpring:x,getForceVectorLength:$,simulator:u,graph:n,lastMove:0};return p(g),g;function y(t){l!==t&&(l=t,z(t))}function C(t){c.forEach(t)}function $(){var t=0,o=0;return C(function(s){t+=Math.abs(s.force.x),o+=Math.abs(s.force.y)}),Math.sqrt(t*t+o*o)}function x(t,o){var s;if(o===void 0)typeof t!="object"?s=t:s=t.id;else{var B=n.hasLink(t,o);if(!B)return;s=B.id}return v[s]}function w(t){return c.get(t)}function F(){n.on("changed",G)}function z(t){g.fire("stable",t)}function G(t){for(var o=0;o<t.length;++o){var s=t[o];s.changeType==="add"?(s.node&&P(s.node.id),s.link&&S(s.link)):s.changeType==="remove"&&(s.node&&q(s.node),s.link&&N(s.link))}e=n.getNodesCount()}function U(){e=0,n.forEachNode(function(t){P(t.id),e+=1}),n.forEachLink(S)}function P(t){var o=c.get(t);if(!o){var s=n.getNode(t);if(!s)throw new Error("initBody() was called with unknown node id");var B=s.position;if(!B){var E=T(s);B=u.getBestNewBodyPosition(E)}o=u.addBodyAt(B),o.id=t,c.set(t,o),I(t),J(s)&&(o.isPinned=!0)}}function q(t){var o=t.id,s=c.get(o);s&&(c.delete(o),u.removeBody(s))}function S(t){I(t.fromId),I(t.toId);var o=c.get(t.fromId),s=c.get(t.toId),B=u.addSpring(o,s,t.length);m(t,B),v[t.id]=B}function N(t){var o=v[t.id];if(o){var s=n.getNode(t.fromId),B=n.getNode(t.toId);s&&I(s.id),B&&I(B.id),delete v[t.id],u.removeSpring(o)}}function T(t){var o=[];if(!t.links)return o;for(var s=Math.min(t.links.length,2),B=0;B<s;++B){var E=t.links[B],Q=E.fromId!==t.id?c.get(E.fromId):c.get(E.toId);Q&&Q.pos&&o.push(Q)}return o}function I(t){var o=c.get(t);if(o.mass=h(t),Number.isNaN(o.mass))throw new Error("Node mass should be a number")}function J(t){return t&&(t.isPinned||t.data&&t.data.isPinned)}function k(t){var o=c.get(t);return o||(P(t),o=c.get(t)),o}function j(t){var o=n.getLinks(t);return o?1+o.length/3:1}function M(t){var o=n.getLinks(t);return o?1+o.size/3:1}}function f(){}return V.exports}var xe=Ee();const Te=Ce(xe),Le=qe({__proto__:null,default:Te},[xe]);export{Le as i};
