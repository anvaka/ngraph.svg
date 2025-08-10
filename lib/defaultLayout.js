import merge from 'ngraph.merge';
import createLayout from 'ngraph.forcelayout';

export default function getDefaultLayout(graph, settings) {
  if (settings.layout) return settings.layout;

  settings = merge(settings, {
    physics: {
      springLength: 30,
      springCoefficient: 0.0008,
      dragCoefficient: 0.01,
      gravity: -1.2,
      theta: 1
    }
  });

  return createLayout(graph, settings.physics);
}
