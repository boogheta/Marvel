/* TODO:
- test smartphone
 + please rotate on vertical screen
 + reduce size sidebar + titles
 + hide footer and explanations in drawers
- fix CSS FF
- lighten GEXF (load graphology jsons instead?)
- use communities labels for creators clusters and document it in explanations
- prespatialize networks
- add social network cards
- list comics associated with clicked node
- click comic to show only attached nodes
- test bipartite network between authors and characters filtered by category of author
*/

import { Sigma } from "./sigma.js";
import getNodeProgramImage from "./sigma.js/rendering/webgl/programs/node.image";

import Graph from "graphology";
import { parse } from "graphology-gexf";
import { circular } from "graphology-layout";
import forceAtlas2 from "graphology-layout-forceatlas2";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import noverlap from 'graphology-layout-noverlap';
import louvain from 'graphology-communities-louvain';

const clusters = {
  resolutions: {
    creators: 0.85,
    characters: 1.15
  },
  roles: {
    writer: "#234fac",
    artist: "#2b6718",
    both: "#d4a129"
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
    "Spider-Man & Marvel Knights": {
      match: "Spider-Man (Peter Parker)",
      color: "#822e23"
    },
    "X-Men": {
      match: "X-Men",
      color: "#d4a129"
    },
    "Other X-Teams": {
      match: "X-Force",
      color: "#d97a2d"
    },
    "Fantastic Four & Cosmic heroes": {
      match: "Fantastic Four",
      color: "#234fac"
    },
    "Ultimate Universe": {
      match: "Ultimates",
      color: "#57b23d"
    },
    "Alpha Flight": {
      match: "Alpha Flight",
      color: "#8d32a7"
    }
  },
  communities: {}
}

const extraPalette = [
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

function divHeight(divId) {
  return document.getElementById(divId).getBoundingClientRect().height;
}

const container = document.getElementById("sigma-container") as HTMLElement,
  loader = document.getElementById("loader") as HTMLElement,
  modal = document.getElementById("modal") as HTMLElement,
  modalImg = document.getElementById("modal-img") as HTMLImageElement,
  explanations = document.getElementById("explanations") as HTMLElement,
  nodeDetails = document.getElementById("node-details") as HTMLElement,
  nodeLabel = document.getElementById("node-label") as HTMLElement,
  nodeImg = document.getElementById("node-img") as HTMLImageElement,
  nodeExtra = document.getElementById("node-extra") as HTMLElement;

modal.addEventListener("click", () => modal.style.display = "none");

const conf = {};
let entity = "characters",
  network_size = "small",
  view = "pictures";

const setTitle = function() {
  window.location.hash = entity + "/" + network_size + "/" + view;
  const title = "raph of " + (network_size === "small" ? "the main" : "most") + " Marvel " + entity + " featured together within same stories";
  document.querySelector("title").innerHTML = "MARVEL networks &mdash; G" + title;
  document.getElementById("title").innerHTML = "This is a g" + title;
}

const defaultSidebar = function() {
  explanations.style.display = "block";
  nodeDetails.style.display = "none";
  modal.style.display = "none";
  modalImg.src = "";
  nodeLabel.innerHTML = "";
  nodeImg.src = "";
  nodeExtra.innerHTML = "";
  resize();
}

let graph = null,
  renderer = null;

const setNodeSize = function(node, stories, sigmaHeight) {
  graph.setNodeAttribute(node,
    "size",
    Math.pow(stories, 0.2)
    * (network_size === "small" ? 2 : 1.25)
    * (entity == "characters" ? 2 : 1.25)
    * sigmaHeight / 900
  );
};

function loadNetwork() {
  loader.style.display = "block";

  if (renderer) renderer.kill();
  renderer = null;
  if (graph) graph.clear();
  graph = null;
  container.innerHTML = '';

  setTitle();
  defaultSidebar()

  clusters.communities = {};

  fetch("./data/Marvel_" + entity + "_by_stories" + (network_size === "small" ? "" : "_full") + ".gexf")
  .then((res) => res.text())
  .then((gexf) => {
    graph = parse(Graph, gexf);

    const communities = louvain(graph, {resolution: clusters.resolutions[entity]});
    graph.forEachNode((node, {label}) => {
      for (var cluster in clusters[entity])
        if (label === clusters[entity][cluster].match) {
          clusters[entity][cluster].community = communities[node];
        clusters.communities[communities[node]] = clusters[entity][cluster];
        clusters.communities[communities[node]].cluster = cluster;
        }
    });

    const circularPositions = circular(graph, { scale: 50 });

    graph.forEachNode((node, {stories, thumbnail, artist, writer}) => {
      const artist_ratio = (entity === "creators" ? artist / (writer + artist) : undefined),
        sigmaHeight = divHeight("sigma-container");
      setNodeSize(node, stories, sigmaHeight);
      graph.mergeNodeAttributes(node, {
        x: circularPositions[node].x,
        y: circularPositions[node].y,
        type: "thumbnail",
        color: (entity === "characters"
          ? (clusters.communities[communities[node]] || {color: extraPalette[communities[node] % extraPalette.length]}).color
          : (artist_ratio > 0.65
            ? clusters.roles.artist
            : (artist_ratio < 0.34
              ? clusters.roles.writer
              : clusters.roles.both
            )
          )
        )
      });
    });

    // Instantiate sigma:
    let sigmaSettings = {
      minCameraRatio: 0.08,
      maxCameraRatio: 1.2,
      defaultEdgeColor: '#1A1A1A',
      labelWeight: 'bold',
      labelFont: 'monospace',
      labelColor: view === "pictures" ? {attribute: 'color'} : {color: '#999'},
      labelRenderedSizeThreshold: (network_size === "small" ? 8 : 4) + (entity === "characters" ? 2 : 0),
      nodeProgramClasses: {
        thumbnail: getNodeProgramImage()
      }
    };
    renderer = new Sigma(graph as any, container, sigmaSettings);

    if (view === "colors") switchView();

    // Bind zoom manipulation buttons
    const camera = renderer.getCamera();
    document.getElementById("zoom-in").addEventListener("click", () => {
      camera.animatedZoom({ duration: 600 });
    });
    document.getElementById("zoom-out").addEventListener("click", () => {
      camera.animatedUnzoom({ duration: 600 });
    });
    document.getElementById("zoom-reset").addEventListener("click", () => {
      camera.animatedReset({ duration: 600 });
    });

    // Handle clicks on nodes
    const clickNode = (node) => {
      if (!node) {
        defaultSidebar();
        renderer.setSetting(
          "nodeReducer", (n, data) => (view === "pictures" ? data : { ...data, image: null })
        );
        renderer.setSetting(
          "edgeReducer", (edge, data) => data
        );
        return;
      }

      const attrs = graph.getNodeAttributes(node);
      explanations.style.display = "none";
      nodeDetails.style.display = "block";

      nodeLabel.innerHTML = attrs.label;
      nodeImg.src = attrs.image_url;
      modalImg.src = attrs.image_url;
      nodeImg.addEventListener("click", () => {
        modal.style.display = "block";
      });

      nodeExtra.innerHTML = "<p>" + attrs.description + "</p>";
      nodeExtra.innerHTML += "<p>Accounted in <b>" + attrs.stories + " stories</b> shared with <b>" + graph.degree(node) + " other " + entity + "</b></p>";
      // Display roles in stories for creators
      if (entity === "creators") {
        if (attrs.writer === 0 && attrs.artist)
          nodeExtra.innerHTML += '<p>Always as <b style="color: ' + clusters.roles.artist + '">artist</b></p>';
        else if (attrs.artist === 0 && attrs.writer)
          nodeExtra.innerHTML += '<p>Always as <b style="color: ' + clusters.roles.writer + '">writer</b></p>';
        else nodeExtra.innerHTML += '<p>Including <b style="color: ' + clusters.roles.writer + '">' + attrs.writer + ' as writer</b> and <b style="color: ' + clusters.roles.artist + '">' + attrs.artist + " as artist</b></p>";
      }
      // Or communities if we have it for characters
      else if (clusters.communities[communities[node]])
        nodeExtra.innerHTML += '<p>Attached to the <b style="color: ' + clusters.communities[communities[node]].color + '">' + clusters.communities[communities[node]].cluster + '</b> community<sup>*</sup></p>';
      if (attrs.url)
        nodeExtra.innerHTML += '<p><a href="' + attrs.url + '" target="_blank">More on Marvel.com…</a></p>';

      // Highlight clicked node and make it bigger always with a picture and hide unconnected ones
      renderer.setSetting(
        "nodeReducer", (n, data) => {
          if (view === "pictures")
            return (n === node || graph.hasEdge(n, node)
              ? { ...data, zIndex: 1, size: data.size * (n === node ? 1.5 : 1) }
              : { ...data, zIndex: 0, color: "#2A2A2A", image: null, size: network_size === "small" ? 5 : 3 }
            )
          else return (n === node
            ? { ...data, zIndex: 1, size: data.size * (n === node ? 1.5 : 1) }
            : (graph.hasEdge(n, node)
                ? { ...data, zIndex: 1, size: data.size * (n === node ? 1.5 : 1), image: null }
                : { ...data, zIndex: 0, color: "#2A2A2A", image: null, size: network_size === "small" ? 5 : 3 }
              )
            )
        }
      );
      // Hide unrelated links and highlight weight and color as the target the node's links 
      renderer.setSetting(
        "edgeReducer", (edge, data) =>
          graph.hasExtremity(edge, node)
            ? { ...data, color: lighten(graph.getNodeAttribute(graph.opposite(node, edge), 'color'), 25), size: Math.log(graph.getEdgeAttribute(edge, 'weight'))}
            : { ...data, color: "#FFF", hidden: true }
      );
    };
    renderer.on("clickNode", (event) => clickNode(event.node));
    renderer.on("clickStage", () => clickNode(null));

    // Add pointer on hovering nodes
    renderer.on('enterNode', () => container.style.cursor = 'pointer');
    renderer.on('leaveNode', () => container.style.cursor = 'default');

    // Setup nodes search
    const searchInput = document.getElementById("search-input") as HTMLInputElement,
      searchSuggestions = document.getElementById("suggestions") as HTMLDataListElement;

    let selectedNode = null,
      suggestions = [];
    const setSearchQuery = (query) => {
      if (searchInput.value !== query)
        searchInput.value = query;

      if (query.length > 1) {
        const lcQuery = query.toLowerCase();
        suggestions = [];
        graph.forEachNode((node, {label}) => {
          if (label.toLowerCase().includes(lcQuery))
            suggestions.push({node: node, label: label});
        });

        if (suggestions.length >= 1 && suggestions[0].label === query) {
          if (selectedNode)
            graph.setNodeAttribute(selectedNode, "highlighted", false);
          selectedNode = suggestions[0].node;
          suggestions = [];
          // Move the camera to center it on the selected node:
          renderer.getCamera().animate(
            renderer.getNodeDisplayData(selectedNode),
            {duration: 500}
          );
          graph.setNodeAttribute(selectedNode, "highlighted", true);
          clickNode(selectedNode);
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
    }
    searchInput.addEventListener("input", () => {
      setSearchQuery(searchInput.value || "");
    });
    searchInput.addEventListener("blur", () => {
      setSearchQuery("");
    });

    // Run spatialisation
    const sensibleSettings = forceAtlas2.inferSettings(graph);
    const fa2Layout = new FA2Layout(graph, {
      settings: sensibleSettings
    });
    fa2Layout.start();
    loader.style.display = "none";
    setTimeout(() => {
      fa2Layout.stop();
      noverlap.assign(graph);
    }, network_size === "small" ? 15000 : 45000);

  });
}

// Fullscreen/window buttons
const win = document.documentElement as any,
  fullScreenBtn = document.getElementById("fullscreen") as HTMLButtonElement;
fullScreenBtn.addEventListener("click", () => {
  if (win.requestFullscreen) {
    win.requestFullscreen();
  } else if (win.webkitRequestFullscreen) { /* Safari */
    win.webkitRequestFullscreen();
  } else if (win.msRequestFullscreen) { /* IE11 */
    win.msRequestFullscreen();
  }
  fullScreenBtn.style.display = "none";
  regScreenBtn.style.display = "block";
});

const regScreenBtn = document.getElementById("regscreen") as HTMLButtonElement;
regScreenBtn.addEventListener("click", () => {
  if ((document as any).exitFullscreen) {
    (document as any).exitFullscreen();
  } else if ((document as any).webkitExitFullscreen) { /* Safari */
    (document as any).webkitExitFullscreen();
  } else if ((document as any).msExitFullscreen) { /* IE11 */
    (document as any).msExitFullscreen();
  }
  regScreenBtn.style.display = "none";
  fullScreenBtn.style.display = "block";
});

// Network switch buttons
const switchNodeType = document.getElementById("node-type-switch") as HTMLInputElement,
  switchNodeFilter = document.getElementById("node-filter-switch") as HTMLInputElement,
  switchNodeView = document.getElementById("node-view-switch") as HTMLInputElement,
  entitySpans = document.querySelectorAll(".entity") as NodeListOf<HTMLElement>,
  charactersDetailsSpans = document.querySelectorAll(".characters-details") as NodeListOf<HTMLElement>,
  creatorsDetailsSpans = document.querySelectorAll(".creators-details") as NodeListOf<HTMLElement>,
  smallDetailsSpans = document.querySelectorAll(".small-details") as NodeListOf<HTMLElement>,
  fullDetailsSpans = document.querySelectorAll(".full-details") as NodeListOf<HTMLElement>;

const setEntity = function(val) {
  entity = val;
  entitySpans.forEach((span) => span.innerHTML = val);
  creatorsDetailsSpans.forEach((span) => span.style.display = (val === "creators" ? "inline" : "none"));
  charactersDetailsSpans.forEach((span) => span.style.display = (val === "characters" ? "inline" : "none"));
  document.getElementById("clusters").innerHTML = Object.keys(clusters.characters)
    .map((k) => '<span style="color: ' + clusters.characters[k].color + '">' + k + '</span>')
    .join(", ");
  document.getElementById("min-stories").innerHTML = conf["min_stories_for_" + val];
  document.getElementById("cooccurrence-threshold").innerHTML = conf["cooccurrence_threshold_for_" + entity];
};

const setSize = function(val) {
  network_size = val;
  smallDetailsSpans.forEach((span) => span.style.display = (val === "small" ? "inline" : "none"));
  fullDetailsSpans.forEach((span) => span.style.display = (val === "full" ? "inline" : "none"));
};

const setView = function(val) {
  view = val
  window.location.hash = entity + "/" + network_size + "/" + view;
};
const switchView = function() {
  renderer.setSetting("labelColor", view === "pictures" ? {attribute: 'color'} : {color: '#999'});
  renderer.setSetting("nodeReducer", (n, data) => (view === "pictures" ? data : { ...data, image: null }));
};

// Responsiveness
function resize() {
  const freeHeight = divHeight("sidebar") - divHeight("header") - divHeight("footer");
  explanations.style.height = (freeHeight - 13) + "px";
  explanations.style["min-height"] = (freeHeight - 13) + "px";
  nodeDetails.style.height = (freeHeight - 18) + "px";
  nodeDetails.style["min-height"] = (freeHeight - 18) + "px";
  if (graph) {
    const sigmaHeight = divHeight("sigma-container");
    graph.forEachNode((node, {stories}) =>
      setNodeSize(node, stories, sigmaHeight)
    );
  }
};
window.addEventListener("resize", resize);
resize();

// Collect data's metadata for explanations
fetch("./config.yml.example")
.then((res) => res.text())
.then((confdata) => {
  confdata.split("\n").forEach((line) => {
    const keyval = line.split(/:\s*/);
    conf[keyval[0]] = keyval[1];
  });
  Object.keys(clusters.roles).forEach((k) =>
    document.getElementById(k + "-color").style.color = clusters.roles[k]
  );

  // Read first url to set settings
  let currentUrl = window.location.hash.replace(/^#/, '')
  if (currentUrl === "")
    currentUrl = entity + "/" + network_size + "/" + view;
  const args = currentUrl.split("/");

  // Setup Node type switch
  if (args[0] === "creators")
    switchNodeType.checked = true;
  setEntity(args[0]);
  switchNodeType.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    setEntity(target.checked ? "creators" : "characters");
    loadNetwork();
  });

  // Setup Size filter switch
  if (args[1] === "full")
    switchNodeFilter.checked = true;
  setSize(args[1]);
  switchNodeFilter.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    setSize(target.checked ? "full" : "small");
    loadNetwork();
  });

  // Setup View switch
  if (args[2] === "colors")
    switchNodeView.checked = true;
  setView(args[2]);
  switchNodeView.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    setView(target.checked ? "colors" : "pictures");
    switchView();
  });

  // Load first network from settings
  loadNetwork();
});
