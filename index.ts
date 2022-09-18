/* TODO:
- add disclaimer/methodo
- prespatialize networks
- adjust communities colors
- list comics associated with clicked node
- click comic to show only attached nodes
- fullscreen button
- add social network cards
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
  roles: {
    artist: "#234fac",
    writer: "#2b6718",
    "full-stack": "#d4a129"
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

// Lighten colors function copied from Chris Coyier https://css-tricks.com/snippets/javascript/lighten-darken-color/
const lighten = function(col, amt) {
  var usePound = false;
  if (col[0] == "#") {
    col = col.slice(1);
    usePound = true;
  }
  var num = parseInt(col,16);
  var r = (num >> 16) + amt;
  if (r > 255) r = 255;
  else if  (r < 0) r = 0;
  var b = ((num >> 8) & 0x00FF) + amt;
  if (b > 255) b = 255;
  else if  (b < 0) b = 0;
  var g = (num & 0x0000FF) + amt;
  if (g > 255) g = 255;
  else if (g < 0) g = 0;
  return (usePound?"#":"") + (g | (b << 8) | (r << 16)).toString(16);
}

const container = document.getElementById("sigma-container") as HTMLElement,
  loader = document.getElementById("loader") as HTMLElement,
  modalImg = document.getElementById("modal-img") as HTMLImageElement,
  explanations = document.getElementById("explanations") as HTMLElement,
  nodeLabel = document.getElementById("node-label") as HTMLElement,
  nodeImg = document.getElementById("node-img") as HTMLImageElement,
  nodeExtra = document.getElementById("node-extra") as HTMLElement,
  zoomInBtn = document.getElementById("zoom-in") as HTMLElement,
  zoomOutBtn = document.getElementById("zoom-out") as HTMLElement,
  zoomResetBtn = document.getElementById("zoom-reset") as HTMLElement,
  modal = document.getElementById("modal") as HTMLElement;

modal.addEventListener("click", () => modal.style.display = "none");

let renderer = null;

function loadNetwork() {
  setTitle();
  
  if (renderer) renderer.kill();
  container.innerHTML = '';
  loader.style.display = "block";
  explanations.style.display = "block";
  modal.style.display = "none";
  modalImg.src = "";
  nodeLabel.innerHTML = "";
  nodeImg.src = "";
  nodeExtra.innerHTML = "";
  clusters.communities = {};
  
  fetch("./data/Marvel_" + entity + "_by_stories" + (network_size === "small" ? "" : "_full") + ".gexf")
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
    graph.forEachNode((node, {comics, thumbnail, artist, writer}) => {
      const artist_ratio = (entity === "creators" ? artist / (writer + artist) : undefined);
      graph.mergeNodeAttributes(node, {
        x: circularPositions[node].x,
        y: circularPositions[node].y,
        size: Math.pow(comics, 0.2) * (network_size === "small" ? 4 : (entity == "characters" ? 2 : 1.75)),
        color: entity === "characters" ?
          (clusters.communities[communities[node]] || {color: fixedPalette[communities[node] % fixedPalette.length]}).color :
          (artist_ratio > 0.65 ? clusters.roles.artist : (artist_ratio < 0.34 ? clusters.roles.writer : clusters.roles["full-stack"]))
      });
      if (network_size == "small")
        graph.setNodeAttribute(node, "type", "thumbnail");
    });
    /*graph.forEachEdge((edge, attrs, n1, n2, n1_attrs, n2_attrs) => {
      graph.mergeEdgeAttributes(edge, {size: 1});
      if (n1_attrs.color === n2_attrs.color)
        graph.setEdgeAttribute(edge, 'color', n1_attrs.color);
    });*/

    // Instantiate sigma:
    let sigmaSettings = {
      minCameraRatio: 0.08,
      maxCameraRatio: 1.2,
      defaultEdgeColor: '#1A1A1A',
      labelWeight: 'bold',
      labelFont: 'monospace',
      labelColor: network_size === "small" ? {attribute: 'color'} : {color: '#999'},
      labelRenderedSizeThreshold: network_size === "small" ? 11 : 6
    };
    if (network_size == "small")
      sigmaSettings["nodeProgramClasses"] = {
        thumbnail: getNodeProgramImage()
      };
    renderer = new Sigma(graph, container, sigmaSettings);

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
        explanations.style.display = "block";
        modal.style.display = "none";
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
      explanations.style.display = "none";
      nodeLabel.innerHTML = attrs.label;
      nodeImg.src = attrs.image_url;
      modalImg.src = attrs.image_url;
      nodeImg.addEventListener("click", () => {
        modal.style.display = "block";
      });
      nodeExtra.innerHTML = "<p>" + attrs.description + "</p>";
      nodeExtra.innerHTML += "<p>Accounted in <b>" + attrs.comics + " stories</b> shared with <b>" + graph.degree(node) + " other " + entity + "</b></p>";
      if (entity === "creators") {
        if (attrs.writer === 0 && attrs.artist)
          nodeExtra.innerHTML += '<p>Always as <b style="color: ' + clusters.roles.artist + '">artist</b></p>';
        else if (attrs.artist === 0 && attrs.writer)
          nodeExtra.innerHTML += '<p>Always as <b style="color: ' + clusters.roles.writer + '">writer</b></p>';
        else nodeExtra.innerHTML += '<p>Including <b style="color: ' + clusters.roles.writer + '">' + attrs.writer + ' as writer</b> and <b style="color: ' + clusters.roles.artist + '">' + attrs.artist + " as artist</b></p>";
      }
      if (clusters.communities[communities[node]])
        nodeExtra.innerHTML += '<p>Attached to the <b style="color: ' + clusters.communities[communities[node]].color + '">' + clusters.communities[communities[node]].cluster + '</b> community<sup>*</sup></p>';
      if (attrs.url)
        nodeExtra.innerHTML += '<p><a href="' + attrs.url + '" target="_blank">More on Marvel.com…</a></p>';

      renderer.setSetting(
        "nodeReducer", (n, data) =>
          n === node ||
          graph.hasEdge(n, node)
            ? { ...data, zIndex: 1, size: data.size * (n === node ? 1.5 : 1)}
            : { ...data, zIndex: 0, color: "#1A1A1A", image: null, size: network_size === "small" ? 5 : 2 }
      );
      renderer.setSetting(
        "edgeReducer", (edge, data) =>
          graph.hasExtremity(edge, node)
            ? { ...data, color: lighten(graph.getNodeAttribute(graph.opposite(node, edge), 'color'), 25), size: Math.log(graph.getEdgeAttribute(edge, 'weight'))}
            : { ...data, color: "#FFF", hidden: true }
      );
    };
    renderer.on("clickNode", (event) => {
      //event.preventDefault();
      setTimeout(() => clickNode(event.node), 5);
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
      settings: sensibleSettings
    });
    fa2Layout.start();
    loader.style.display = "none";
    setTimeout(() => {
      fa2Layout.stop();
      noverlap.assign(graph);
    }, network_size === "small" ? 15000 : 90000);

  });
}

let entity = "characters",
  network_size = "small";

const pageTitle = document.querySelector("title") as HTMLElement;
const h2Title = document.getElementById("title") as HTMLElement;
const setTitle = function() {
  window.location.hash = entity + "/" + network_size;
  const title = "raph of " + (network_size === "small" ? "the main" : "most") + " Marvel " + entity + " featuring together within same stories";
  pageTitle.innerHTML = "MARVEL networks &mdash; G" + title;
  h2Title.innerHTML = "This is a g" + title;
}

const switchCharacters = document.getElementById("switch-characters") as HTMLElement;
const switchCreators = document.getElementById("switch-creators") as HTMLElement;
const switchSmall = document.getElementById("switch-small") as HTMLElement;
const switchFull = document.getElementById("switch-full") as HTMLElement;
const setEntity = function(val, noload) {
  if (val === "characters") {
    switchCreators.style.display = "block";
    switchCharacters.style.display = "none";
  } else {
    switchCreators.style.display = "none";
    switchCharacters.style.display = "block";
  }
  entity = val;
  if (!noload)
    loadNetwork();
};
switchCharacters.addEventListener("click", () => setEntity("characters", false));
switchCreators.addEventListener("click", () => setEntity("creators", false));
const setSize = function(val) {
  if (val === "small") {
    switchSmall.style.display = "none";
    switchFull.style.display = "block";
  } else {
    switchSmall.style.display = "block";
    switchFull.style.display = "none";
  }
  network_size = val;
  loadNetwork();
};
switchFull.addEventListener("click", () => setSize("full"));
switchSmall.addEventListener("click", () => setSize("small"));

const currentUrl = window.location.hash.replace(/^#/, '')
if (currentUrl !== "") {
  const args = currentUrl.split("/");
  setEntity(args[0], true);
  setSize(args[1]);
} else {
  loadNetwork();
}

