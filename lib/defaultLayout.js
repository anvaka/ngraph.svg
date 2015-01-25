var merge = require('ngraph.merge');

module.exports = getDefaultLayout;

function getDefaultLayout(graph, settings) {
  if (settings.layout) return settings.layout;

  settings = merge(settings, {
    physics: {
      springLength: 30,
      springCoeff: 0.0008,
      dragCoeff: 0.01,
      gravity: -1.2,
      theta: 1
    }
  });

  var layout = require('ngraph.forcelayout');
  var physics = layout.simulator;

  return layout(graph, physics(settings.physics));
}
