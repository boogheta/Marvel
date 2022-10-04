const fs = require('fs');
const pako = require ("pako");

const graphology = require ("graphology");
const gexf = require("graphology-gexf");
const layouts = require ("graphology-layout");
const forceAtlas2 = require ('graphology-layout-forceatlas2');
const noverlap = require ('graphology-layout-noverlap');
const louvain = require ('graphology-communities-louvain');

const args = process.argv.slice(2);
const filename = args[0];
const fileroot = filename.replace(/gexf$/, "");
const entity = /creators/.test(filename) ? "creators" : "characters";
const network_size= /full/.test(filename) ? "full" : "small";
const links_type = /stories/.test(filename) ? "stories" : "comics";
const FA2Iterations = (args.length < 2 ? 15000 : parseInt(args[1]));
const batchIterations = (args.length < 3 ? 1000 : parseInt(args[2]));

function readGEXF(filename) {
  console.log("Working on " + filename + " ...");
  const gexfile = fs.readFileSync(filename, {encoding:'utf8', flag:'r'});
  const graph = gexf.parse(graphology.Graph, gexfile);

  const circularPositions = layouts.circular(graph, { scale: 50 });

  graph.forEachNode(node => {
    const size = graph.getNodeAttributes(node, links_type);
    graph.mergeNodeAttributes(node, {
      x: circularPositions[node].x,
      y: circularPositions[node].y,
      size: Math.pow(size, 0.2)
        * (entity === "characters" ? 1.75 : 1.25)
        * (network_size === "small" ? 1.75 : 1.25)
    });
  });

  return graph;
}

function runBatchFA2(graph, settings, doneIterations, finalCallback) {
  const t0 = Date.now();
  forceAtlas2.assign(graph, {
    iterations: batchIterations,
    getEdgeWeight: "weight",
    settings: settings
  });
  console.log(' FA2 batch of ' + batchIterations + ' iterations processed in:', (Date.now() - t0)/1000 + "s");
  doneIterations += batchIterations;
  if (doneIterations < FA2Iterations)
    runBatchFA2(graph, settings, doneIterations, finalCallback);
  else finalCallback(doneIterations);
}

function processGraph(graph){

  // Displaying graph's stats
  console.log('Number of nodes:', graph.order);
  console.log('Number of edges:', graph.size);

  let time0 = Date.now();

  // Use pointwise mutual information to sparse edges
  const total = graph.reduceNodes((tot, node, attrs) => tot + attrs[links_type], 0);
  graph.forEachEdge((edge, {weight}, n1, n2, n1_attrs, n2_attrs) => {
    graph.setEdgeAttribute(edge, "weight",
      Math.max(graph.degree(n1) === 1 || graph.degree(n2) === 1 ? 1 : 0, Math.log(total * weight / (n1_attrs[links_type] * n2_attrs[links_type])))
    );
  });

  // Run Louvain to field community
  if (entity === "characters")
    louvain.assign(graph, {resolution: 1.2});

  // Spatializing with FA2
  console.log('Starting ForceAtlas2 for ' + FA2Iterations + ' iterations by batches of ' + batchIterations);
  const settings = forceAtlas2.inferSettings(graph);
  settings.edgeWeightInfluence = 0.5;
  runBatchFA2(graph, settings, 0, function(doneIterations) {
    let time1 = Date.now();
    console.log('ForceAtlas2 fully processed in:', (time1 - time0)/1000 + "s (" + doneIterations + " iterations)");

    noverlap.assign(graph);

    // Reduce output size by reducing floats to ints
    graph.forEachEdge((edge, {weight}) =>
      graph.setEdgeAttribute(edge, "weight", Math.round(1000 * weight))
    );

    fs.writeFileSync(fileroot + "json.gz", pako.deflate(JSON.stringify(graph)));
    console.log(" -> Saved " + fileroot + "json.gz");
  });
}

const graph = readGEXF(filename);
processGraph(graph);
