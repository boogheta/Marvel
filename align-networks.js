const fs = require('fs');

const graphology = require ("graphology");
const layouts = require ("graphology-layout");
const forceAtlas2 = require ('graphology-layout-forceatlas2');
const noverlap = require ('graphology-layout-noverlap');

const pako = require ("pako");

const args = process.argv.slice(2);
const filename = args[0];
const refFile = args[1];
const backup = filename + "_backup";
const FA2Iterations = (args.length < 3 ? 5000 : parseInt(args[2]));
const mirrorX = args.slice(2).indexOf("--mirror-x") === "-1" ? 1 : -1;
const mirrorY = args.slice(2).indexOf("--mirror-y") === "-1" ? 1 : -1;
function readPakoJSON(filename) {
  console.log("Reading " + filename + " ...");
  const pakofile = fs.readFileSync(filename, {flag:'r'});
  return graphology.Graph.from(JSON.parse(pako.inflate(pakofile, {to: "string"})));
}

function writePakoJSON(graph, filename) {
  console.log("Writing " + filename + " ...");
  fs.writeFileSync(filename, pako.deflate(JSON.stringify(graph)));
}

function mirrorGraph(graph) {
  graph.forEachNode((node, {x, y}) =>
    graph.mergeNodeAttributes(node, {
      x: mirrorX * x,
      y: mirrorY * y
    })
  );
}

function alignGraph(graph, reference, output) {
  // Displaying graphs stats
  console.log('Number of nodes (file/ref):', graph.order, "|", ref.order);
  console.log('Number of edges (file/ref):', graph.size, "|", ref.size);

  // Copy positions from reference graph when present in both networks
  // Use usual circularPositions as default instead
  console.log("Copying positions from", refFile, "into", filename, "...");
  const circularPositions = layouts.circular(graph, { scale: 50 });
  let missing = 0;
  graph.forEachNode(node => {
    const refAttrs = (reference.hasNode(node)
      ? reference.getNodeAttributes(node)
      : {}
    );
    if (!refAttrs) missing++;
    graph.mergeNodeAttributes(node, {
      x: refAttrs.x || circularPositions[node].x,
      y: refAttrs.y || circularPositions[node].y
    });
  });
  console.log(missing, "nodes are missing from ref file");

  // Make edge weights floats again
  graph.forEachEdge((edge, {weight}) =>
    graph.setEdgeAttribute(edge, "weight", weight / 1000)
  );

  // Spatialize with FA2
  console.log('Starting ForceAtlas2 for', FA2Iterations, 'iterations...');
  const settings = forceAtlas2.inferSettings(graph);
  settings.edgeWeightInfluence = 0.5;
  forceAtlas2.assign(graph, {
    iterations: FA2Iterations,
    getEdgeWeight: "weight",
    settings: settings
  });
  noverlap.assign(graph);

  // Reduce output size by reducing floats to ints
  graph.forEachEdge((edge, {weight}) =>
    graph.setEdgeAttribute(edge, "weight", Math.round(1000 * weight))
  );

  writePakoJSON(graph, output);
  console.log(" -> Saved " + output);
}

const g = readPakoJSON(filename),
  ref = readPakoJSON(refFile);
writePakoJSON(g, filename + ".backup");
if (mirrorX === -1 || mirrorY === -1) {
  writePakoJSON(ref, refFile + ".backup");
  mirrorGraph(ref);
  writePakoJSON(ref, refFile);
}
alignGraph(g, ref, filename);
