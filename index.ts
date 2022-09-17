/* TODO:
- test data with stories instead of comics
- option full networks with no thumbnails
- display typeof creator in sidebar (donut?)
- read url arguments (entity, selectedNode)
- list comics associated with clicked node
- click comic to show only attached nodes
- fullscreen button
- add disclaimer/methodo
- creators categories based on type of creator instead
- filter unconnected nodes
- filter less connected nodes (and those without pic)
- filter overconnected
*/

import {Sigma} from "sigma";
import { Coordinates, EdgeDisplayData, NodeDisplayData } from "sigma/types";
import getNodeProgramImage from "sigma/rendering/webgl/programs/node.image";

import Graph from "graphology";
import { parse } from "graphology-gexf";
import { circular } from "graphology-layout";
import forceAtlas2 from "graphology-layout-forceatlas2";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import noverlap from 'graphology-layout-noverlap';
import louvain from 'graphology-communities-louvain';

let entity = "characters";
const switchBtn = document.getElementById("switch") as HTMLElement;
switchBtn.addEventListener("click", () => {
  if (entity === "characters")
    entity = "creators";
  else entity = "characters";
  loadNetwork();
});

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
      color: "#A22e23"
    }
  },
  characters: {
    "Avengers": {
      match: "Avengers",
      color: "#2b6718"
    },
    "Champions": {
      match: "Spider-Man (Miles Morales)",
      color: "#57b23d"
    },
    "Fantastic Four & Cosmic Heroes": {
      match: "Fantastic Four",
      color: "#234fac"
    },
    "Spider-Man & Marvel Knights": {
      match: "Spider-Man (Peter Parker)",
      color: "#822e23"
    },
    "X-Men": {
      match: "X-Men",
      color: "#d4a129"
    },
    "X-Factor & X-Force": {
      match: "X-Force",
      color: "#d97a2d"
    },
    "Alpha Flight": {
      match: "Alpha Flight",
      color: "#8d32a7"
    },
    "Ultimate Universe": {
      match: "Ultimates",
      color: "#424c9b"
    },
  },
  communities: {}
}

const container = document.getElementById("sigma-container") as HTMLElement,
  loader = document.getElementById("loader") as HTMLElement,
  nodeLabel = document.getElementById("node-label") as HTMLElement,
  nodeImg = document.getElementById("node-img") as HTMLImageElement,
  nodeExtra = document.getElementById("node-extra") as HTMLElement,
  zoomInBtn = document.getElementById("zoom-in") as HTMLElement,
  zoomOutBtn = document.getElementById("zoom-out") as HTMLElement,
  zoomResetBtn = document.getElementById("zoom-reset") as HTMLElement;

let renderer = null;

function loadNetwork() {
  if (renderer) renderer.kill();
  container.innerHTML = '';
  loader.style.display = "block";
  nodeLabel.innerHTML = "";
  nodeImg.src = "";
  nodeExtra.innerHTML = "";
  
  fetch("./data/Marvel_" + entity + ".gexf")
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
        clusters.communities[communities[node]].cluster = cluster;
        }
    });
    graph.forEachNode((node, {comics, thumbnail}) => {
      graph.mergeNodeAttributes(node, {
        x: circularPositions[node].x,
        y: circularPositions[node].y,
        size: Math.pow(comics, 0.2) * 4,
        color: (clusters.communities[communities[node]] || {color: fixedPalette[communities[node] % fixedPalette.length]}).color,
        type: "thumbnail"
      });
    });
    /*graph.forEachEdge((edge, attrs, n1, n2, n1_attrs, n2_attrs) => {
      graph.mergeEdgeAttributes(edge, {size: 1});
      if (n1_attrs.color === n2_attrs.color)
        graph.setEdgeAttribute(edge, 'color', n1_attrs.color);
    });*/

    // Instantiate sigma:
    renderer = new Sigma(graph, container, {
      minCameraRatio: 0.08,
      maxCameraRatio: 1.2,
      defaultEdgeColor: '#1A1A1A',
      labelWeight: 'bold',
      labelFont: 'monospace',
      labelColor: {attribute: 'color'},
      labelRenderedSizeThreshold: 11,
      nodeProgramClasses: {
        thumbnail: getNodeProgramImage()
      }
    });

    // Bind zoom manipulation buttons
    const camera = renderer.getCamera();
    zoomInBtn.addEventListener("click", () => {
      camera.animatedZoom({ duration: 600 });
    });
    zoomOutBtn.addEventListener("click", () => {
      camera.animatedUnzoom({ duration: 600 });
    });
    zoomResetBtn.addEventListener("click", () => {
      camera.animatedReset({ duration: 600 });
    });

    // Handle clicks on nodes
    const clickNode = (node) => {
      if (!node) {
        nodeLabel.innerHTML = "";
        nodeImg.src = "";
        nodeExtra.innerHTML = "";
        renderer.setSetting(
          "nodeReducer", (n, data) => data
        );
        renderer.setSetting(
          "edgeReducer", (edge, data) => data
        );
        return;
      }
      const attrs = graph.getNodeAttributes(node);
      nodeLabel.innerHTML = attrs.label;
      nodeImg.src = attrs.image_url;
      nodeExtra.innerHTML = "<p>" + attrs.description + "</p>";
      nodeExtra.innerHTML += "<p>Accounted in <b>" + attrs.comics + " issues</b> shared with <b>" + graph.degree(node) + " other " + entity + "</b></p>";
      if (clusters.communities[communities[node]])
        nodeExtra.innerHTML += '<p>Attached to the <b><span style="color: ' + clusters.communities[communities[node]].color + '">' + clusters.communities[communities[node]].cluster + '</span></b> community<sup>*</sup></p>';
      if (attrs.url)
        nodeExtra.innerHTML += '<p><a href="' + attrs.url + '" target="_blank">More on Marvel.com…</a></p>';

      renderer.setSetting(
        "nodeReducer", (n, data) =>
          n === node ||
          graph.hasEdge(n, node)
            ? { ...data, zIndex: 1 }
            : { ...data, zIndex: 0, label: "", hidden: true }
      );
      renderer.setSetting(
        "edgeReducer", (edge, data) =>
          graph.hasExtremity(edge, node)
            ? { ...data, color: graph.getNodeAttribute(graph.opposite(node, edge), 'color'), size: Math.log(graph.getEdgeAttribute(edge, 'weight'))}
            : { ...data, color: "#FFF", hidden: true }
      );
    };
    renderer.on("clickNode", (event) => {
      //event.preventDefault();
      setTimeout(() => clickNode(event.node), 50);
    });
    container.addEventListener("click", (e) =>  {
      clickNode(null);
    });

    // Setup nodes search
    const searchInput = document.getElementById("search-input") as HTMLInputElement;
    const searchSuggestions = document.getElementById("suggestions") as HTMLDataListElement;
    let selectedNode = null,
      suggestions = [];
    const setSearchQuery = (query) => {
      if (searchInput.value !== query) searchInput.value = query;
      if (query.length > 1) {
        const lcQuery = query.toLowerCase();
        suggestions = [];
        graph.forEachNode((node, {label}) => {
          if (label.toLowerCase().includes(lcQuery))
            suggestions.push({node: node, label: label});
        });

        if (suggestions.length === 1 && suggestions[0].label === query) {
          if (selectedNode)
            graph.setNodeAttribute(selectedNode, "highlighted", false);
          selectedNode = suggestions[0].node;
          suggestions = [];
          graph.setNodeAttribute(selectedNode, "highlighted", true);
          clickNode(selectedNode);
          // Move the camera to center it on the selected node:
          const nodePosition = renderer.getNodeDisplayData(selectedNode) as Coordinates;
          renderer.getCamera().animate(nodePosition, {
            duration: 500,
          });
        } else if (selectedNode) {
          graph.setNodeAttribute(selectedNode, "highlighted", false);
          selectedNode = null;
        }
      } else if (selectedNode) {
        graph.setNodeAttribute(selectedNode, "highlighted", false);
        selectedNode = null;
        suggestions = [];
      }
      searchSuggestions.innerHTML = suggestions
        .sort()
        .map((node) => "<option>" + node.label + "</option>")
        .join("\n");
      // Refresh rendering:
      renderer.refresh();
    }
    searchInput.addEventListener("input", () => {
      setSearchQuery(searchInput.value || "");
    });
    searchInput.addEventListener("blur", () => {
      setSearchQuery("");
    });

    const sensibleSettings = forceAtlas2.inferSettings(graph);
    const fa2Layout = new FA2Layout(graph, {
      settings: sensibleSettings,
    });
    fa2Layout.start();
    loader.style.display = "none";
    setTimeout(() => {
      fa2Layout.stop();
      noverlap.assign(graph);
    }, 5000);

  });
}
loadNetwork();
