/* TODO:
- adjust color clusters full characters
- use communities labels for creators clusters and document it in explanations
IDEAS:
- list comics associated with clicked node
- click/hover comic to show only attached nodes
- test bipartite network between authors and characters filtered by category of author
*/

import pako from "pako";

import Graph from "graphology";
import { animateNodes } from "./sigma.js/utils/animate";

import { Sigma } from "./sigma.js";
import getNodeProgramImage from "./sigma.js/rendering/webgl/programs/node.image";

// Init global vars
let entity = "",
  network_size = "",
  view = "",
  selectedNode = null,
  selectedNodeLabel = null,
  graph = null,
  renderer = null,
  camera = null,
  sigmaDim = null,
  suggestions = [];

const conf = {},
  clusters = {
    counts: {},
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
      "X-Men": {
        match: "X-Men",
        color: "#d4a129"
      },
      "Spider-Man & Marvel Knights": {
        match: "Spider-Man (Peter Parker)",
        color: "#822e23"
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
  },
  extraPalette = [
    "#bce25b",
    "#0051c4",
    "#d52f3f",
    "#ded03f",
    "#2cc143",
    "#8b4a98",
    "#5fb1ff",
    "#ff993e",
    "#904f13",
    "#c45ecf",
  ];

// Lighten colors function copied from Chris Coyier https://css-tricks.com/snippets/javascript/lighten-darken-color/
function lighten(col, amt) {
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

function fmtNumber(x) {
  return (x + "")
    .replace(/(.)(.{3})$/, "$1&nbsp;$2");
}

const container = document.getElementById("sigma-container") as HTMLElement,
  loader = document.getElementById("loader") as HTMLElement,
  modal = document.getElementById("modal") as HTMLElement,
  modalImg = document.getElementById("modal-img") as HTMLImageElement,
  explanations = document.getElementById("explanations") as HTMLElement,
  orderSpan = document.getElementById("order") as HTMLElement,
  nodeDetails = document.getElementById("node-details") as HTMLElement,
  nodeLabel = document.getElementById("node-label") as HTMLElement,
  nodeImg = document.getElementById("node-img") as HTMLImageElement,
  nodeExtra = document.getElementById("node-extra") as HTMLElement,
  searchInput = document.getElementById("search-input") as HTMLInputElement,
  searchSuggestions = document.getElementById("suggestions") as HTMLDataListElement,
  selectSuggestions = document.getElementById("suggestions-select") as HTMLSelectElement;

modal.onclick = () => modal.style.display = "none";

function divWidth(divId) {
  return document.getElementById(divId).getBoundingClientRect().width;
}
function divHeight(divId) {
  return document.getElementById(divId).getBoundingClientRect().height;
}

function setPermalink(ent, siz, vie, sel) {
  const selection = graph && sel && graph.hasNode(sel) ? "/" + graph.getNodeAttribute(sel, "label").replace(/ /g, "+") : "";
  window.location.hash = ent + "/" + siz + "/" + vie + selection;
}

function defaultSidebar() {
  explanations.style.display = "block";
  nodeDetails.style.display = "none";
  modal.style.display = "none";
  modalImg.src = "";
  nodeLabel.innerHTML = "";
  nodeImg.src = "";
  nodeExtra.innerHTML = "";
  resize();
}

function computeNodeSize(node, stories, ratio) {
  return Math.pow(stories, 0.2)
    * (entity == "characters" ? 1.75 : 1.25)
    * (network_size === "small" ? 1.75 : 1.25)
    * sigmaDim / 1000
    / ratio;
};

function loadNetwork() {
  fetch("./data/Marvel_" + entity + "_by_stories" + (network_size === "small" ? "" : "_full") + ".json.gz")
  .then((res) => res.arrayBuffer())
  .then((text) => {
    // Parse pako zipped graphology serialized network JSON
    graph = Graph.from(JSON.parse(pako.inflate(text, {to: "string"})));

    orderSpan.innerHTML = fmtNumber(graph.order);

    // Identify community ids of main hardcoded colors
    clusters.communities = {};
    clusters.counts = {};
    graph.forEachNode((node, {label, community}) => {
      for (var cluster in clusters[entity])
        if (label === clusters[entity][cluster].match) {
          clusters[entity][cluster].community = community;
          clusters.communities[community] = clusters[entity][cluster];
          clusters.communities[community].cluster = cluster;
          clusters.communities[community].community = community;
        }
    });

    // Adjust nodes visual attributes for rendering (size, color, images)
    graph.forEachNode((node, {x, y,stories, thumbnail, artist, writer, community}) => {
      const artist_ratio = (entity === "creators" ? artist / (writer + artist) : undefined),
        role = artist_ratio > 0.65 ? "artist" : (artist_ratio < 0.34 ? "writer" : "both"),
        color = (entity === "characters"
          ? (clusters.communities[community] || {color: extraPalette[community % extraPalette.length]}).color
          : clusters.roles[role]
        );
      const key = entity === "characters" ? community : role;
      if (!clusters.counts[key])
        clusters.counts[key] = 0;
      clusters.counts[key]++;
      graph.mergeNodeAttributes(node, {
        type: "thumbnail",
        size: computeNodeSize(node, stories, 1),
        color: color,
        hlcolor: color
      });
    });

    // Feed communities size to explanations
    if (entity === "creators")
      Object.keys(clusters.roles).forEach((k) => {
        const role = document.getElementById(k + "-color");
        role.style.color = clusters.roles[k];
        role.innerHTML = k + " (" + fmtNumber(clusters.counts[k]) + ")";
      })
    else document.getElementById("clusters").innerHTML = Object.keys(clusters.characters)
      .map((k) => '<b style="color: ' + clusters.characters[k].color + '">' + k + ' (' + fmtNumber(clusters.counts[clusters.characters[k].community]) + ')</b>')
      .join(", ");

    // Instantiate sigma:
    let sigmaSettings = {
      minCameraRatio: 0.07,
      maxCameraRatio: 100,
      defaultEdgeColor: '#2A2A2A',
      labelWeight: 'bold',
      labelFont: 'monospace',
      labelColor: view === "pictures" ? {attribute: 'color'} : {color: '#999'},
      labelRenderedSizeThreshold: ((network_size === "small" ? 6 : 4) + (entity === "characters" ? 1 : 0)) * sigmaDim / 1000,
      nodeProgramClasses: {
        thumbnail: getNodeProgramImage()
      }
    };
    renderer = new Sigma(graph as any, container, sigmaSettings);

    // Bind zoom manipulation buttons
    function adjustNodesSizeToZoom(extraRatio) {
      const newSizes = {},
        ratio = extraRatio ? Math.pow(1.1, Math.log(camera.ratio * extraRatio) / Math.log(1.5)) : 1;
      graph.forEachNode((node, {stories}) => {
        newSizes[node] = {size: computeNodeSize(node, stories, ratio)}
      });
      animateNodes(graph, newSizes, { duration: extraRatio == 1 ? 200 : 600, easing: "quadraticOut" });
    }
    camera = renderer.getCamera();
    document.getElementById("zoom-in").onclick = () => {
      camera.animatedZoom({ duration: 600 });
      if (camera.ratio > sigmaSettings.minCameraRatio)
        adjustNodesSizeToZoom(1/1.5);
    };
    document.getElementById("zoom-out").onclick = () => {
      camera.animatedUnzoom({ duration: 600 });
      if (camera.ratio < sigmaSettings.maxCameraRatio)
        adjustNodesSizeToZoom(1.5);
    };
    document.getElementById("zoom-reset").onclick = () => {
      camera.animatedReset({ duration: 600 });
      adjustNodesSizeToZoom(0);
    };
    function handleWheel(e) {
      setTimeout(() => adjustNodesSizeToZoom(1), 200);
    }
    renderer.on("wheelNode", (e) => handleWheel(e));
    renderer.on("wheelEdge", (e) => handleWheel(e));
    renderer.on("wheelStage", (e) => handleWheel(e));

    // Add pointer on hovering nodes
    renderer.on("enterNode", () => container.style.cursor = "pointer");
    renderer.on("leaveNode", () => container.style.cursor = "default");

    // Handle clicks on nodes
    renderer.on("clickNode", (event) => clickNode(event.node));
    renderer.on("clickStage", () => setSearchQuery());

    // Prepare list of nodes for search/select suggestions
    const allSuggestions = graph.nodes()
      .map((node) => ({
        node: node,
        label: graph.getNodeAttribute(node, "label")
      }))
      .sort((a, b) => a.label < b.label ? -1 : 1);
    function feedAllSuggestions() {
      suggestions = allSuggestions.map(x => x);
    }
    feedAllSuggestions();

    // Feed all nodes to select for touchscreens
    selectSuggestions.innerHTML = "<option>Search…</option>" + allSuggestions
      .sort()
      .map((node) => "<option>" + node.label + "</option>")
      .join("\n");
    selectSuggestions.onchange = () => {
      const idx = selectSuggestions.selectedIndex;
      clickNode(idx ? allSuggestions[idx - 1].node : null);
    };

    // Setup nodes input search for web browsers
    function setSearchQuery(query="") {
      feedAllSuggestions();
      if (searchInput.value !== query)
        searchInput.value = query;

      if (query) {
        const lcQuery = query.toLowerCase();
        suggestions = [];
        graph.forEachNode((node, {label}) => {
          if (label.toLowerCase().includes(lcQuery))
            suggestions.push({node: node, label: label});
        });

        if (suggestions.length >= 1 && suggestions[0].label === query) {
          clickNode(suggestions[0].node);
          // Move the camera to center it on the selected node:
          camera.animate(
            renderer.getNodeDisplayData(selectedNode),
            {duration: 500}
          );
          suggestions = [];
        } else if (selectedNode) {
          clickNode(null);
        }
      } else if (selectedNode) {
        clickNode(null);
        feedAllSuggestions();
      }
      searchSuggestions.innerHTML = suggestions
        .sort()
        .map((node) => "<option>" + node.label + "</option>")
        .join("\n");
    }
    searchInput.oninput = () => {
      setSearchQuery(searchInput.value || "");
    };
    searchInput.onblur = () => {
      if (!selectedNode)
        setSearchQuery();
    };
    if (!selectedNodeLabel)
      setSearchQuery();

    // Init view
    if (view === "colors")
      switchView();

    // Zoom in graph on init network
    loader.style.display = "none";
    camera.ratio = Math.pow(5, 3);
    const initLoop = setInterval(() => {
      document.querySelectorAll("canvas").forEach(canvas => canvas.style.display = "block");
      setTimeout(() => {
        const ratio = Math.pow(1.1, Math.log(camera.ratio) / Math.log(1.5)),
          newSizes = {};
        graph.forEachNode((node, {stories}) => {
          newSizes[node] = {size: computeNodeSize(node, stories, ratio)}
        });
        animateNodes(graph, newSizes, { duration: 100, easing: "quadraticOut" });
      }, 100);
      if (camera.ratio <= 5) {
        camera.animate({ratio: 1}, {duration: 100, easing: "linear"});
        renderer.setSetting("maxCameraRatio", 1.3);
        clickNode(graph.findNode((n, {label}) => label === selectedNodeLabel), false);
        selectedNodeLabel = null;
        return clearInterval(initLoop);
      }
      camera.animate({ratio: camera.ratio / 5}, {duration: 100, easing: "linear"});
    }, 100);
  });
}

function clickNode(node, updateURL=true) {
  if (!graph || !renderer) return;
  // Unselect previous node
  if (selectedNode) {
    if (graph.hasNode(selectedNode))
      graph.setNodeAttribute(selectedNode, "highlighted", false)
    selectedNode = null;
    nodeImg.src = "";
    modalImg.src = "";
  }

  // Reset unselected node view
  if (!node) {
    selectedNode = null;
    selectedNodeLabel = null;
    if (updateURL)
      setPermalink(entity, network_size, view, node);
    selectSuggestions.selectedIndex = 0;
    defaultSidebar();
    renderer.setSetting(
      "nodeReducer", (n, data) => (view === "pictures" ? data : { ...data, image: null })
    );
    renderer.setSetting(
      "edgeReducer", (edge, data) => data
    );
    renderer.setSetting(
      "labelColor", view === "pictures" ? {attribute: 'color'} : {color: '#999'}
    );
    return;
  }

  selectedNode = node;
  if (updateURL)
    setPermalink(entity, network_size, view, node);

  // Fill sidebar with selected node's details
  const attrs = graph.getNodeAttributes(node);
  explanations.style.display = "none";
  nodeDetails.style.display = "block";
  nodeLabel.innerHTML = attrs.label;
  nodeImg.src = attrs.image_url.replace(/^http:/, '');
  modalImg.src = attrs.image_url.replace(/^http:/, '');
  nodeImg.onclick = () => {
    modal.style.display = "block";
  };

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
  else if (clusters.communities[attrs.community])
    nodeExtra.innerHTML += '<p>Attached to the <b style="color: ' + clusters.communities[attrs.community].color + '">' + clusters.communities[attrs.community].cluster + '</b> community<sup class="asterisk">*</sup></p>';
  if (attrs.url)
    nodeExtra.innerHTML += '<p><a href="' + attrs.url + '" target="_blank">More on Marvel.com…</a></p>';

  // Highlight clicked node and make it bigger always with a picture and hide unconnected ones
  graph.setNodeAttribute(node, "highlighted", true);
  function dataConnected(data) {
    const res = {
      ...data,
      zIndex: 1,
      hlcolor: null
    }
    if (view === "colors")
      res.image = null;
    return res;
  }
  renderer.setSetting(
    "nodeReducer", (n, data) => {
      return n === node
        ? { ...data,
            zIndex: 2,
            size: data.size * 1.5
          }
        : graph.hasEdge(n, node)
          ? dataConnected(data)
          : { ...data,
              zIndex: 0,
              color: "#2A2A2A",
              image: null,
              size: sigmaDim / 350,
              label: null
            };
    }
  );
  // Hide unrelated links and highlight, weight and color as the target the node's links
  renderer.setSetting(
    "edgeReducer", (edge, data) =>
      graph.hasExtremity(edge, node)
        ? { ...data,
            zIndex: 0,
            color: lighten(graph.getNodeAttribute(graph.opposite(node, edge), 'color'), 75),
            size: Math.max(0.1, Math.log(graph.getEdgeAttribute(edge, 'weight') * sigmaDim / 200000))
          }
        : { ...data,
            zIndex: 0,
            color: "#FFF",
            hidden: true
          }
  );
  renderer.setSetting(
    "labelColor", {attribute: "hlcolor", color: "#CCC"}
  );
};

// Fullscreen button
const win = document.documentElement as any,
  fullScreenBtn = document.getElementById("fullscreen") as HTMLButtonElement;
fullScreenBtn.onclick = () => {
  if (win.requestFullscreen) {
    win.requestFullscreen();
  } else if (win.webkitRequestFullscreen) { /* Safari */
    win.webkitRequestFullscreen();
  } else if (win.msRequestFullscreen) { /* IE11 */
    win.msRequestFullscreen();
  }
};

// Exit Fullscreen button
const regScreenBtn = document.getElementById("regscreen") as HTMLButtonElement;
regScreenBtn.onclick = () => {
  if ((document as any).exitFullscreen) {
    (document as any).exitFullscreen();
  } else if ((document as any).webkitExitFullscreen) { /* Safari */
    (document as any).webkitExitFullscreen();
  } else if ((document as any).msExitFullscreen) { /* IE11 */
    (document as any).msExitFullscreen();
  }
};

// Network switch buttons
const switchNodeType = document.getElementById("node-type-switch") as HTMLInputElement,
  switchNodeFilter = document.getElementById("node-filter-switch") as HTMLInputElement,
  switchNodeView = document.getElementById("node-view-switch") as HTMLInputElement,
  entitySpans = document.querySelectorAll(".entity") as NodeListOf<HTMLElement>,
  charactersDetailsSpans = document.querySelectorAll(".characters-details") as NodeListOf<HTMLElement>,
  creatorsDetailsSpans = document.querySelectorAll(".creators-details") as NodeListOf<HTMLElement>,
  colorsDetailsSpans = document.querySelectorAll(".colors-details") as NodeListOf<HTMLElement>,
  picturesDetailsSpans = document.querySelectorAll(".pictures-details") as NodeListOf<HTMLElement>,
  smallDetailsSpans = document.querySelectorAll(".small-details") as NodeListOf<HTMLElement>,
  fullDetailsSpans = document.querySelectorAll(".full-details") as NodeListOf<HTMLElement>;

function setEntity(val) {
  entity = val;
  entitySpans.forEach((span) => span.innerHTML = val);
  charactersDetailsSpans.forEach((span) => span.style.display = (val === "characters" ? "inline" : "none"));
  creatorsDetailsSpans.forEach((span) => span.style.display = (val === "creators" ? "inline" : "none"));
  document.getElementById("min-stories").innerHTML = conf["min_stories_for_" + val];
  document.getElementById("cooccurrence-threshold").innerHTML = conf["cooccurrence_threshold_for_" + entity];
}

function setSize(val) {
  network_size = val;
  smallDetailsSpans.forEach((span) => span.style.display = (val === "small" ? "inline" : "none"));
  fullDetailsSpans.forEach((span) => span.style.display = (val === "full" ? "inline" : "none"));
}

function setView(val) {
  view = val
  colorsDetailsSpans.forEach((span) => span.style.display = (val === "colors" ? "inline" : "none"));
  picturesDetailsSpans.forEach((span) => span.style.display = (val === "pictures" ? "inline" : "none"));
};
function switchView() {
  if (!renderer) return;
  renderer.setSetting("labelColor", view === "pictures" ? {attribute: 'color'} : {color: '#999'});
  renderer.setSetting("nodeReducer", (n, data) => (view === "pictures" ? data : { ...data, image: null }));
  if (graph && selectedNode && graph.hasNode(selectedNode))
    clickNode(selectedNode, false);
};

// Responsiveness
let resizing = false;
function doResize() {
  resizing = true;
  const freeHeight = divHeight("sidebar") - divHeight("header") - divHeight("footer");
  explanations.style.height = (freeHeight - 13) + "px";
  explanations.style["min-height"] = (freeHeight - 13) + "px";
  nodeDetails.style.height = (freeHeight - 18) + "px";
  nodeDetails.style["min-height"] = (freeHeight - 18) + "px";
  sigmaDim = Math.min(divHeight("sigma-container"), divWidth("sigma-container"));
  if (renderer && graph && camera) {
    const ratio = Math.pow(1.1, Math.log(camera.ratio) / Math.log(1.5));
    renderer.setSetting("labelRenderedSizeThreshold", ((network_size === "small" ? 6 : 4) + (entity === "characters" ? 1 : 0)) * sigmaDim/1000);
    graph.forEachNode((node, {stories}) =>
      graph.setNodeAttribute(node, "size", computeNodeSize(node, stories, ratio))
    );
  }
  resizing = false;
}
function resize() {
  if (resizing) return;
  resizing = true;
  setTimeout(doResize, 50);
};
window.onresize = resize;

switchNodeType.onchange = (event) => {
  const target = event.target as HTMLInputElement;
  setPermalink(target.checked ? "creators" : "characters", network_size, view, selectedNode);
};
switchNodeFilter.onchange = (event) => {
  const target = event.target as HTMLInputElement;
  setPermalink(entity, target.checked ? "full" : "small", view, selectedNode);
};
switchNodeView.onchange = (event) => {
  const target = event.target as HTMLInputElement;
  setPermalink(entity, network_size, target.checked ? "colors" : "pictures", selectedNode);
};

function readUrl() {
  let currentUrl = window.location.hash.replace(/^#/, '');
  if (currentUrl === "" || currentUrl.split("/").length < 3)
    currentUrl = "characters/small/pictures";
  let args = currentUrl.split("/");

  let reload = false,
    switchv = false,
    clickn = false;
  if (args[0] !== entity || args[1] !== network_size)
    reload = true;
  else if (args[2] !== view)
    switchv = true;
  if (args.length >= 4 && args[3]) {
    selectedNodeLabel = args[3].replace(/\+/g, " ");
  } else selectedNodeLabel = null;
  if (graph && (
    (selectedNodeLabel && (!selectedNode || selectedNodeLabel !== graph.getNodeAttribute(selectedNode, "label")))
    || (!selectedNodeLabel && selectedNode)
  ))
    clickn = true;

  // Setup optional SelectedNode (before setting view which depends on it)
  if (args.length >= 4 && args[3])
    searchInput.value = args[3].replace(/\+/g, " ");

  // Setup Node type switch
  if (args[0] === "creators")
    switchNodeType.checked = true;
  setEntity(args[0]);

  // Setup Size filter switch
  if (args[1] === "full")
    switchNodeFilter.checked = true;
  setSize(args[1]);

  // Setup View switch
  if (args[2] === "colors")
    switchNodeView.checked = true;
  setView(args[2]);

  doResize();
  if (reload) {
    loader.style.display = "block";

    // Kill pre existing network
    if (renderer) renderer.kill();
    renderer = null;
    if (graph) graph.clear();
    graph = null;
    camera = null;
    container.innerHTML = '';
    orderSpan.innerHTML = '';

    // Setup Sidebar default content
    const title = "ap of " + (network_size === "small" ? "the main" : "most") + " Marvel " + entity + " featured together within same stories";
    document.querySelector("title").innerHTML = "MARVEL networks &mdash; M" + title;
    document.getElementById("title").innerHTML = "This is a m" + title;
    if (!selectedNodeLabel)
      defaultSidebar();

    // Load network file
    setTimeout(loadNetwork, 0);
  }
  else if (switchv)
    switchView();
  else if (clickn)
    clickNode(graph.findNode((n, {label}) => label === selectedNodeLabel), false);
}
window.onhashchange = readUrl;

// Collect data's metadata to feed explanations
fetch("./config.yml.example")
.then((res) => res.text())
.then((confdata) => {
  confdata.split("\n").forEach((line) => {
    const keyval = line.split(/:\s*/);
    conf[keyval[0]] = keyval[1];
  });

  // Read first url to set settings
  readUrl();
});
