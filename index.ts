/* TODO:
- autostop FA2 + add noverlap
- branch search node
- branch or adjust label rate
- add switch network button
- use loader ?
- label font?
- fullscreen button
- add title/credits
- hover nodes
- click nodes with detailed window
- filter unconnected nodes
- filter less connected nodes (and those without pic)
- filter overconnected
- add border colors ?
- add cluster labels https://codesandbox.io/s/github/jacomyal/sigma.js/tree/main/examples/clusters-labels
- option full networks with no thumbnails
*/

import {Sigma} from "sigma";
import Graph from "graphology";
import { parse } from "graphology-gexf";
import { circular } from "graphology-layout";
import forceAtlas2 from "graphology-layout-forceatlas2";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import noverlap from 'graphology-layout-noverlap';
import louvain from 'graphology-communities-louvain';
import getNodeProgramImage from "sigma/rendering/webgl/programs/node.image";

const entity = "creators";

const fixedPalette = [
  "#5fb1ff",
  "#ff993e",
  "#8b4a98",
  "#bce25b",
  "#d52f3f",
  "#0051c4",
  "#2cc143",
  "#c45ecf",
  "#ded03f",
  "#904f13",
];
const clusters = {
  resolutions: {
    creators: 0.85,
    characters: 1.2
  },
  creators: {
    "Silver Age": {
      match: "Stan Lee",
      color: "#CCC"
    },
    "Bronze Age": {
      match: "Chris Claremont",
      color: "#d4a129"
    },
    "Millenium Age": {
      match: "Brian Michael Bendis",
      color: "#8d32a7"
    },
    "Modern Age": {
      match: "Donny Cates",
      color: "#822e23"
    }
  },
  characters: {
    Avengers: {
      match: "Avengers",
      color: "#2b6718"
    },
    Champions: {
      match: "Spider-Man (Miles Morales)",
      color: "#57b23d"
    },
    "Fantastic Four": {
      match: "Fantastic Four",
      color: "#234fac"
    },
    "Spider-Man": {
      match: "Spider-Man (Peter Parker)",
      color: "#822e23"
    },
    "X-Men": {
      match: "X-Men",
      color: "#d4a129"
    },
    "X-Force": {
      match: "X-Force",
      color: "#d97a2d"
    },
    "Alpha Flight": {
      match: "Alpha Flight",
      color: "#8d32a7"
    },
    Ultimate: {
      match: "Ultimates",
      color: "#424c9b"
    },
  },
  communities: {}
}
// Load external GEXF file:
fetch("./Marvel_" + entity + ".gexf")
  .then((res) => res.text())
  .then((gexf) => {
    const graph = parse(Graph, gexf);
    const circularPositions = circular(graph, { scale: 50 });
    const communities = louvain(graph, {resolution: clusters.resolutions[entity]});
    graph.forEachNode((node, {label}) => {
      for (var cluster in clusters[entity])
        if (label === clusters[entity][cluster].match) {
          clusters[entity][cluster].community = communities[node];
        clusters.communities[communities[node]] = clusters[entity][cluster];
        }
    });
    console.log(clusters);
    graph.forEachNode((node, {comics, thumbnail}) => {
      graph.mergeNodeAttributes(node, {
        x: circularPositions[node].x,
        y: circularPositions[node].y,
        size: Math.pow(comics, 0.2) * 4,
        color: (clusters.communities[communities[node]] || {color: fixedPalette[communities[node] % fixedPalette.length]}).color,
        //color: clusters.communities[communities[node]].color,
        type: "thumbnail"
      });
    });
    /*graph.forEachEdge((edge, attrs, n1, n2, n1_attrs, n2_attrs) => {
      if (n1_attrs.color === n2_attrs.color)
        graph.setEdgeAttribute(edge, 'color', n1_attrs.color);
    });*/

    // Retrieve some useful DOM elements:
    const container = document.getElementById("sigma-container") as HTMLElement;
    const zoomInBtn = document.getElementById("zoom-in") as HTMLElement;
    const zoomOutBtn = document.getElementById("zoom-out") as HTMLElement;
    const zoomResetBtn = document.getElementById("zoom-reset") as HTMLElement;

    // Instanciate sigma:
    const renderer = new Sigma(graph, container, {
      minCameraRatio: 0.08,
      maxCameraRatio: 1.2,
      defaultEdgeColor: '#1A1A1A',
      labelWeight: 'bold',
      labelColor: {attribute: 'color'},
      nodeProgramClasses: {
        thumbnail: getNodeProgramImage()
      }
    });
    const camera = renderer.getCamera();

    // Bind zoom manipulation buttons
    zoomInBtn.addEventListener("click", () => {
      camera.animatedZoom({ duration: 600 });
    });
    zoomOutBtn.addEventListener("click", () => {
      camera.animatedUnzoom({ duration: 600 });
    });
    zoomResetBtn.addEventListener("click", () => {
      camera.animatedReset({ duration: 600 });
    });

    const sensibleSettings = forceAtlas2.inferSettings(graph);
    const fa2Layout = new FA2Layout(graph, {
      settings: sensibleSettings,
    });
    fa2Layout.start();
    setTimeout(() => {
      fa2Layout.stop();
      noverlap.assign(graph);
    }, 5000);

  });

