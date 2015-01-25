var graph = require('ngraph.graph')();
graph.addLink(1, 2);
graph.addLink(2, 3);

var renderer = require('../../')(graph, {
    physics: {
      // this will be the default length:
      springLength: 400,
      // this function will be called for each link when it's added to simulator
      springTransform: springTransform
    }
});

var dx = 0.2;
var layout = renderer.layout;
renderer.run();

// just for fun, we will be dynamically modifying length of the 2 -> 3 spring:
modifySpringLength();

function springTransform(link, spring) {
  if (link.fromId === 1) {
    // this will make links from node 1 only 300px in length (keep in mind
    // other physical settings will lead to longer/shorter distances)
    spring.length = 300;
  }
}

function modifySpringLength() {
  window.requestAnimationFrame(modifySpringLength);

  var link = layout.getSpring(2, 3);
  link.length += dx;
  if (link.length < 10) {
    link.length = 10;
    dx = 2;
  } else if (link.length > 500) {
    link.length = 500;
    dx = -2;
  }
  // make sure renderer never stops
  renderer.resetStable();
}
