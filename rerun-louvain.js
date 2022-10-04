const fs = require('fs');
const pako = require ("pako");

const graphology = require ("graphology");
const louvain = require ('graphology-communities-louvain');

const args = process.argv.slice(2);
const filename = args[0];
const entity = /creators/.test(filename) ? "creators" : "characters";
const resolution = args.length > 1 ? parseFloat(args[1]) : 1.2;

function readPakoJSON(filename) {
  console.log("Reading " + filename + " ...");
  const pakofile = fs.readFileSync(filename, {flag:'r'});
  return graphology.Graph.from(JSON.parse(pako.inflate(pakofile, {to: "string"})));
}

function writePakoJSON(graph, filename) {
  console.log("Writing " + filename + " ...");
  fs.writeFileSync(filename, pako.deflate(JSON.stringify(graph)));
}

function updateLouvainGraph(graph, reso) {
  // Displaying graphs stats
  console.log('Number of nodes:', graph.order);
  console.log('Number of edges:', graph.size);

  // Make edge weights floats again
  graph.forEachEdge((edge, {weight}) =>
    graph.setEdgeAttribute(edge, "weight", weight / 1000)
  );

  // Run Louvain to field community
  louvain.assign(graph, {resolution: reso});

  // Reduce output size by reducing floats to ints
  graph.forEachEdge((edge, {weight}) =>
    graph.setEdgeAttribute(edge, "weight", Math.round(1000 * weight))
  );
}

const g = readPakoJSON(filename);
updateLouvainGraph(g, resolution);
writePakoJSON(g, filename);
