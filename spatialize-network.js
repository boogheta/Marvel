import fs from 'fs';

import Graph from "graphology";
import { parse } from "graphology-gexf";
import { circular } from "graphology-layout";
import forceAtlas2 from 'graphology-layout-forceatlas2';
import noverlap from 'graphology-layout-noverlap';
import louvain from 'graphology-communities-louvain';

const args = process.argv.slice(2);
const filename = args[0];
const fileroot = filename.replace(/gexf$/, "");
const entity = /creators/.test(filename) ? "creators" : "characters";
const network_size= /full/.test(filename) ? "full" : "small";
const links_type = /stories/.test(filename) ? "stories" : "comics";
const FA2Iterations = (args.length < 2 ? 5000 : parseInt(args[1]));
const batchIterations = (args.length < 3 ? 500 : parseInt(args[2]));

function readGEXF(filename) {
  console.log("Working on " + filename + " ...");
  let gexf = fs.readFileSync(filename, {encoding:'utf8', flag:'r'});
  let graph = parse(Graph, gexf);

  const circularPositions = circular(graph, { scale: 50 });

  graph.forEachNode(node => {
    let size = graph.getNodeAttributes(node, links_type);
    graph.mergeNodeAttributes(node, {
      x: circularPositions[node].x,
      y: circularPositions[node].y,
      size: Math.pow(size, 0.2)
        * (entity == "characters" ? 2 : 1.25)
        * (network_size === "small" ? 2 : 1.25)
    });
  });

  return graph;
}

function runBatchFA2(graph, settings, doneIterations, finalCallback) {
  const t0 = Date.now();
  forceAtlas2.assign(graph, {
    iterations: batchIterations,
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

  // Run Louvain to field community
  louvain.assign(graph, {resolution: entity === "creators" ? 0.85 : 1.15});

  // Spatializing with FA2
  console.log('Starting ForceAtlas2 for ' + FA2Iterations + ' iterations by batches of ' + batchIterations);
  const circularPositions = circular(graph, { scale: 50 });
  runBatchFA2(
    graph,
    forceAtlas2.inferSettings(graph),
    0,
    function(doneIterations) {
      let time1 = Date.now();
      console.log('ForceAtlas2 fully processed in:', (time1 - time0)/1000 + "s (" + doneIterations + " iterations)");

      noverlap.assign(graph);
      fs.writeFileSync(fileroot + "json", JSON.stringify(graph.toJSON()));
      console.log(" -> Saved " + fileroot+ " json");
    }
  );
}

let graph = readGEXF(filename);
processGraph(graph);
