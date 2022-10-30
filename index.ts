/* TODO:
- bind url with selected comic?
- if low debit, load comics/pictures only on explore comics click?
- check bad data marvel :
  - http://gateway.marvel.com/v1/public/stories/186542/creators incoherent with https://www.marvel.com/comics/issue/84372/damage_control_2022_1
  - check why Tiomothy Truman has no comic
  - check why zoom on Spiderman 1602 only zooms on regular spiderman
  - test new spatialization graphology
 => scraper comics as counter-truth? :
  - select good creators fields
  - take from scraping good image url if /clean within (example https://www.marvel.com/comics/issue/51567/captain_britain_and_the_mighty_defenders_2015_1)
  - handle missing dates?
  - rebuild creators network from cleaned comics instead
  - filter imprint marvel
  - add cover artist in comics list, not in links used
 => one more check with takoyaki on authors/characters labels + readjust louvain after
- update screenshots
- auto data updates
IDEAS:
- install app button?
- swipe images with actual slide effect?
- test bipartite network between authors and characters filtered by category of author
*/

import pako from "pako";
import Papa from "papaparse";
import Graph from "graphology";
import { animateNodes } from "./sigma.js/utils/animate";
import { Sigma } from "./sigma.js";
import { Coordinates } from "./sigma.js/types";
import {
  formatNumber, formatMonth,
  lightenColor,
  meanArray,
  divWidth, divHeight,
  webGLSupport,
  rotatePosition
} from "./utils";
import {
  startYear, curYear, totalYears,
  picturesLoadingDelay, playComicsDelay,
  creatorsRoles, clusters,
  extraPalette,
  sigmaSettings
} from "./settings";


/* -- Init global state -- */

let entity = "",
  networkSize = "",
  view = "",
  selectedNode = null,
  selectedNodeType = null,
  selectedNodeLabel = null,
  sigmaDim = null,
  renderer = null,
  camera = null,
  clustersLayer = null,
  resizeClusterLabels = function() {},
  histograms = {
    characters: {},
    creators: {}
  },
  suggestions = [],
  comicsReady = null,
  comicsBarView = false,
  hoveredComic = null,
  selectedComic = null,
  networksLoaded = 0,
  playing = null,
  sortComics = "date";

const conf = {},
  networks = {},
  picturesRenderingDelay = {},
  allComics = [],
  allCharacters = {"-1": "missing info"},
  allCreators = {"-1": "missing info"},
  crossMap = {creators: {}, characters: {}},
  charactersComics = {},
  creatorsComics = {};

// Init global vars for each view variant
["creators", "characters"].forEach(e => {
  picturesRenderingDelay[e] = picturesLoadingDelay;
  networks[e] = {};
  ["main", "most"].forEach(s => {
    networks[e][s] = {
      communities: {},
      counts: {},
      clusters: {}
    }
    for (let cl in clusters[e]) {
      networks[e][s].clusters[cl] = {};
      for (let at in clusters[e][cl])
        networks[e][s].clusters[cl][at] = clusters[e][cl][at];
    }
  });
});

// Useful DOM elements
const container = document.getElementById("sigma-container") as HTMLElement,
  loader = document.getElementById("loader") as HTMLElement,
  loaderComics = document.getElementById("loader-comics") as HTMLElement,
  loaderList = document.getElementById("loader-list") as HTMLElement,
  modal = document.getElementById("modal") as HTMLElement,
  modalImg = document.getElementById("modal-img") as HTMLImageElement,
  modalNext = document.getElementById("modal-next") as HTMLButtonElement,
  modalPrev = document.getElementById("modal-previous") as HTMLButtonElement,
  modalPlay = document.getElementById("modal-play") as HTMLButtonElement,
  modalPause = document.getElementById("modal-pause") as HTMLButtonElement,
  comicsNext = document.getElementById("comics-next") as HTMLButtonElement,
  comicsPrev = document.getElementById("comics-prev") as HTMLButtonElement,
  comicsPlay = document.getElementById("comics-play") as HTMLButtonElement,
  comicsPause = document.getElementById("comics-pause") as HTMLButtonElement,
  filterComics = document.getElementById("comics-filter") as HTMLButtonElement,
  filterSearch = document.getElementById("filter-comics") as HTMLButtonElement,
  filterInput = document.getElementById("filter-input") as HTMLButtonElement,
  sortAlpha = document.getElementById("comics-sort-alpha") as HTMLButtonElement,
  sortDate = document.getElementById("comics-sort-date") as HTMLButtonElement,
  sideBar = document.getElementById("sidebar") as HTMLImageElement,
  explanations = document.getElementById("explanations") as HTMLElement,
  viewAllComicsButton = document.getElementById("view-all-comics") as HTMLElement,
  orderSpan = document.getElementById("order") as HTMLElement,
  nodeDetails = document.getElementById("node-details") as HTMLElement,
  nodeLabel = document.getElementById("node-label") as HTMLElement,
  nodeImg = document.getElementById("node-img") as HTMLImageElement,
  nodeExtra = document.getElementById("node-extra") as HTMLElement,
  nodeHistogram = document.getElementById("node-histogram") as HTMLElement,
  fullHistogram = document.getElementById("full-histogram") as HTMLElement,
  comicsBar = document.getElementById("comics-bar") as HTMLImageElement,
  comicsDiv = document.getElementById("comics") as HTMLImageElement,
  comicsTitle = document.getElementById("comics-title") as HTMLElement,
  comicsSubtitle = document.getElementById("comics-subtitle") as HTMLElement,
  comicsSubtitleList = document.getElementById("comics-subtitle-list") as HTMLElement,
  comicsList = document.getElementById("comics-list") as HTMLElement,
  comicsCache = document.getElementById("comics-cache") as HTMLElement,
  comicTitle = document.getElementById("comic-title") as HTMLLinkElement,
  comicUrl = document.getElementById("comic-url") as HTMLLinkElement,
  comicImg = document.getElementById("comic-img") as HTMLImageElement,
  comicDesc = document.getElementById("comic-desc") as HTMLLinkElement,
  comicEntities = document.querySelectorAll(".comic-entities") as NodeListOf<HTMLElement>,
  comicCreators = document.getElementById("comic-creators") as HTMLElement,
  comicCharacters = document.getElementById("comic-characters") as HTMLElement,
  searchInput = document.getElementById("search-input") as HTMLInputElement,
  searchSuggestions = document.getElementById("suggestions") as HTMLDataListElement,
  selectSuggestions = document.getElementById("suggestions-select") as HTMLSelectElement,
  switchNodeType = document.getElementById("node-type-switch") as HTMLInputElement,
  switchTypeLabel = document.getElementById("switch-type") as HTMLInputElement,
  switchNodeFilter = document.getElementById("node-filter-switch") as HTMLInputElement,
  switchFilterLabel = document.getElementById("switch-filter") as HTMLInputElement,
  switchNodeView = document.getElementById("node-view-switch") as HTMLInputElement,
  switchViewLabel = document.getElementById("switch-view") as HTMLInputElement,
  entitySpans = document.querySelectorAll(".entity") as NodeListOf<HTMLElement>,
  charactersDetailsSpans = document.querySelectorAll(".characters-details") as NodeListOf<HTMLElement>,
  creatorsDetailsSpans = document.querySelectorAll(".creators-details") as NodeListOf<HTMLElement>,
  colorsDetailsSpans = document.querySelectorAll(".colors-details") as NodeListOf<HTMLElement>,
  picturesDetailsSpans = document.querySelectorAll(".pictures-details") as NodeListOf<HTMLElement>,
  mainDetailsSpans = document.querySelectorAll(".main-details") as NodeListOf<HTMLElement>,
  mostDetailsSpans = document.querySelectorAll(".most-details") as NodeListOf<HTMLElement>;


/* -- Load & prepare data -- */

function loadNetwork(ent, siz, callback = null, waitForComics = false) {
  if (networks[ent][siz].loaded && (!waitForComics || comicsReady))
    return callback ? setTimeout(callback, 0) : null;

  if (callback || (waitForComics && !comicsReady)) {
    loader.style.display = "block";
    loader.style.opacity = "0.5";
  }

  if (networks[ent][siz].loading) {
    if (callback) {
      const waiter = setInterval(() => {
        if (!networks[ent][siz].loaded || (waitForComics && !comicsReady))
          return;
        clearInterval(waiter);
        return setTimeout(callback, 0);
      }, 50);
    }
    return;
  }

  networks[ent][siz].loading = true;
  loaderComics.style.display = "block";
  return fetch("./data/Marvel_" + ent + "_by_stories" + (siz === "main" ? "" : "_full") + ".json.gz")
    .then(res => res.arrayBuffer())
    .then(content => {
      buildNetwork(content, ent, siz)
      networks[ent][siz].loaded = true;
      networksLoaded += 1;
      if (networksLoaded === 4)
        loaderComics.style.display = "none";
      if (callback) {
        if (waitForComics && !comicsReady) {
          const waiter = setInterval(() => {
          if (waitForComics && !comicsReady)
            return;
          clearInterval(waiter);
          return setTimeout(callback, 0);
          }, 50);
        } else return setTimeout(callback, 0);
      }
    });
}

function loadComics(comicsData) {
  const comicsStr = pako.ungzip(comicsData, {to: "string"});
  Papa.parse(comicsStr, {
	worker: true,
    header: true,
    skipEmptyLines: "greedy",
	step: function(c) {
      c = c.data;
      allComics.push(c);

      c.characters = c.characters.split("|").filter(x => x);
      c.characters.forEach(ch => {
        if (!charactersComics[ch])
          charactersComics[ch] = [];
        charactersComics[ch].push(c);
      });

      const artistsIds = {};
      c.artists = c.artists.split("|").filter(x => x);
      c.writers = c.writers.split("|").filter(x => x);
      c.creators = c.writers.concat(c.artists);

      c.artists.forEach(cr => {
        if (!creatorsComics[cr])
          creatorsComics[cr] = [];
        creatorsComics[cr].push({...c, "role": "artist"});
        artistsIds[cr] = creatorsComics[cr].length - 1;
      });

      c.writers.forEach(cr => {
        if (!creatorsComics[cr])
          creatorsComics[cr] = [];
        if (artistsIds[cr])
          creatorsComics[cr][artistsIds[cr]].role = "both";
        else
          creatorsComics[cr].push({...c, "role": "writer"});
      });

      c.creators.forEach(cr => {
        c.characters.forEach(ch => {
          if (!crossMap.creators[ch])
            crossMap.creators[ch] = new Set();
          crossMap.creators[ch].add(cr);
          if (!crossMap.characters[cr])
            crossMap.characters[cr] = new Set();
          crossMap.characters[cr].add(ch);
        });
      });

	},
	complete: function() {
      comicsReady = true;
      loaderComics.style.display = "none";
      viewAllComicsButton.style.display = "block";
      fullHistogram.innerHTML = renderHistogram();
      resize(true);
      if (selectedNode)
        addViewComicsButton(selectedNode);
      ["creators", "characters"].forEach(e =>
        ["main", "most"].forEach(s => loadNetwork(e, s))
      );
    }
  });
}

function computeNodeSize(node, stories) {
  return Math.pow(stories, 0.2)
    * (entity === "characters" ? 1.75 : 1.25)
    * (networkSize === "main" ? 1.75 : 1.25)
    * sigmaDim / 1000
};

function getNodeComics(node) {
  return node === null
    ? allComics
    : charactersComics[node] || creatorsComics[node] || [];
}

function buildNetwork(networkData, ent, siz) {
  const data = networks[ent][siz];
  // Parse pako zipped graphology serialized network JSON
  data.graph = Graph.from(JSON.parse(pako.inflate(networkData, {to: "string"})));

  // Identify community ids of main hardcoded colors
  data.graph.forEachNode((node, {x, y, label, community}) => {
    for (var cluster in data.clusters)
      if (data.clusters[cluster].match.indexOf(label) !== -1) {
        if (ent === "creators") {
          data.clusters[cluster].label = cluster;
          data.clusters[cluster].id = cluster.toLowerCase().replace(/ .*$/, "");
          if (!data.clusters[cluster].positions)
            data.clusters[cluster].positions = [{x: x, y: y}];
          else data.clusters[cluster].positions.push({x: x, y: y});
        } else {
          data.clusters[cluster].community = community;
          data.communities[community] = data.clusters[cluster];
          data.communities[community].label = cluster.replace(/([a-z&]) ([a-z])/ig, "$1&nbsp;$2");
          data.communities[community].community = community;
        }
      }
  });

  // Adjust nodes visual attributes for rendering (size, color, images)
  data.graph.forEachNode((node, {label, x, y, stories, image, artist, writer, community}) => {
    const artist_ratio = (ent === "creators" ? artist / (writer + artist) : undefined),
      role = artist_ratio > 0.65 ? "artist" : (artist_ratio < 0.34 ? "writer" : "both"),
      color = (ent === "characters"
        ? (data.communities[community] || {color: extraPalette[community % extraPalette.length]}).color
        : creatorsRoles[role]
      ),
      key = ent === "characters" ? community : role;
    if (!data.counts[key])
      data.counts[key] = 0;
    data.counts[key]++;
    data.graph.mergeNodeAttributes(node, {
      type: "circle",
      image: /available/i.test(image) ? "" : image,
      size: computeNodeSize(node, stories),
      color: color,
      hlcolor: lightenColor(color, 35)
    });
    if (ent === "creators")
      allCreators[node] = label;
    else allCharacters[node] = label;
  });

  if (ent === "creators") {
    // Calculate positions of ages labels
    for (const cluster in data.clusters) {
      data.clusters[cluster].x = meanArray(data.clusters[cluster].positions.map(n => n.x));
      data.clusters[cluster].y = meanArray(data.clusters[cluster].positions.map(n => n.y));
    }
  }
}


/* -- Graphs display -- */

function renderNetwork() {
  const data = networks[entity][networkSize];

  // Feed communities size to explanations
  orderSpan.innerHTML = formatNumber(data.graph.order);
  if (entity === "creators") {
    Object.keys(creatorsRoles).forEach(k => {
      const role = document.getElementById(k + "-color");
      role.style.color = creatorsRoles[k];
      role.innerHTML = k + " (" + formatNumber(data.counts[k]) + ")";
    })
  } else document.getElementById("clusters-legend").innerHTML = Object.keys(data.clusters)
    .filter(k => !data.clusters[k].hide)
    .map(k =>
      '<b style="color: ' + data.clusters[k].color + '">'
      + k.split(" ").map(x => '<span>' + x + '</span>').join(" ")
      + ' (<span class="color">' + formatNumber(data.counts[data.clusters[k].community]) + '</span>)</b>'
    ).join(", ");

  // Instantiate sigma:
  sigmaSettings["labelRenderedSizeThreshold"] = ((networkSize === "main" ? 6 : 4) + (entity === "characters" ? 1 : 0.5)) * sigmaDim / 1000;
  sigmaSettings["labelColor"] = view === "pictures" ? {attribute: 'hlcolor'} : {color: '#999'};

  container.style.display = "block";
  const sigmaDims = container.getBoundingClientRect();
  sigmaDim = Math.min(sigmaDims.height, sigmaDims.width);
  if (!renderer) {
    renderer = new Sigma(data.graph as any, container, sigmaSettings);

    // insert the clusters layer underneath the hovers layer
    clustersLayer = document.createElement("div");
    clustersLayer.id = "clusters-layer";
    clustersLayer.style.display = "none";
    container.insertBefore(clustersLayer, document.getElementsByClassName("sigma-hovers")[0]);

    // Clusters labels position needs to be updated on each render
    renderer.on("afterRender", () => {
      if (entity === "characters") return;
      resizeClusterLabels();
    });

    // Add pointer on hovering nodes
    renderer.on("enterNode", () => container.style.cursor = "pointer");
    renderer.on("leaveNode", () => container.style.cursor = "default");

    // Handle clicks on nodes
    renderer.on("clickNode", (event) => clickNode(event.node));
    renderer.on("clickStage", () => {
      if (comicsBarView)
        hideComicsBar();
      else setSearchQuery();
    });

    // Bind zoom manipulation buttons
    camera = renderer.getCamera();
    document.getElementById("zoom-in").onclick = () => {
      camera.animatedZoom({ duration: 600 });
    };
    document.getElementById("zoom-out").onclick = () => {
      camera.animatedUnzoom({ duration: 600 });
    };
    document.getElementById("zoom-reset").onclick = () => {
      camera.animatedReset({ duration: 300 });
    };
  } else {
    renderer.setSetting("nodeReducer", (n, attrs) => attrs);
    renderer.setSetting("edgeReducer", (edge, attrs) => attrs);
    renderer.setSetting("labelColor", sigmaSettings["labelColor"]);
    renderer.setSetting("labelRenderedSizeThreshold", sigmaSettings["labelRenderedSizeThreshold"]);
    renderer.setSetting("labelGridCellSize", sigmaSettings.labelGridCellSize);

    renderer.setGraph(data.graph);
  }
  renderer.setSetting("minCameraRatio", entity === "creators" && networkSize === "most" ? 0.035 : 0.07);

  // Render clusters labels layer on top of sigma for creators
  if (entity === "creators") {
    let clusterLabelsDoms = "";
    for (const cluster in data.clusters) {
      const c = data.clusters[cluster];
      // adapt the position to viewport coordinates
      const viewportPos = renderer.graphToViewport(c as Coordinates);
      clusterLabelsDoms += '<div id="community-' + networkSize + "-" + c.id + '" class="cluster-label" style="top: ' + viewportPos.y + 'px; left: ' + viewportPos.x + 'px; color: ' + c.color + '">' + c.label + '</div>';
    }
    clustersLayer.innerHTML = clusterLabelsDoms;

    resizeClusterLabels = () => {
      const sigmaDims = container.getBoundingClientRect();
      clustersLayer.style.width = sigmaDims.width + "px";

      for (const cluster in data.clusters) {
        const c = data.clusters[cluster];
        const clusterLabel = document.getElementById("community-" + networkSize + "-" + c.id);
        if (!clusterLabel) return;
        // update position from the viewport
        const viewportPos = renderer.graphToViewport(c as Coordinates);
        if (viewportPos.x < 5 * cluster.length + 7 || viewportPos.x > sigmaDims.width - 5 * cluster.length - 7 || viewportPos.y > sigmaDims.height - 15)
          clusterLabel.style.display = "none";
        else {
          clusterLabel.style.display = "block";
          clusterLabel.style["min-width"] = (10 * cluster.length) + "px";
          clusterLabel.style.top = viewportPos.y + 'px';
          clusterLabel.style.left = viewportPos.x + 'px';
        }
      }
    };
  }

  // Prepare list of nodes for search/select suggestions
  const allSuggestions = data.graph.nodes()
    .map((node) => ({
      node: node,
      label: data.graph.getNodeAttribute(node, "label")
    }))
    .sort((a, b) => a.label < b.label ? -1 : 1);
  function feedAllSuggestions() {
    suggestions = allSuggestions.map(x => x);
  }
  feedAllSuggestions();

  // Feed all nodes to select for touchscreens
  selectSuggestions.innerHTML = "<option>Search…</option>" + allSuggestions
    .map((node) => "<option>" + node.label + "</option>")
    .join("\n");
  selectSuggestions.onchange = () => {
    const idx = selectSuggestions.selectedIndex;
    clickNode(idx ? allSuggestions[idx - 1].node : null, true, true);
  };

  function fillSuggestions() {
    searchSuggestions.innerHTML = suggestions
      .sort((a, b) => a.label < b.label ? -1 : 1)
      .map((node) => "<option>" + node.label + "</option>")
      .join("\n");
  }
  fillSuggestions();

  // Setup nodes input search for web browsers
  function setSearchQuery(query="") {
    feedAllSuggestions();
    if (searchInput.value !== query)
      searchInput.value = query;

    if (query) {
      const lcQuery = query.toLowerCase();
      suggestions = [];
      data.graph.forEachNode((node, {label}) => {
        if (label.toLowerCase().includes(lcQuery))
          suggestions.push({node: node, label: label});
      });

      const suggestionsMatch = suggestions.filter(x => x.label === query);
      if (suggestionsMatch.length === 1) {
        clickNode(suggestionsMatch[0].node, true, true);
        suggestions = [];
      } else if (selectedNode) {
        clickNode(null);
      }
    } else if (selectedNode) {
      clickNode(null);
      feedAllSuggestions();
    }
    fillSuggestions();
  }
  searchInput.oninput = () => {
    setSearchQuery(searchInput.value || "");
  };
  searchInput.onblur = () => {
    if (!selectedNode)
      setSearchQuery();
  };

  function finalizeGraph(loop = null) {
    // Load comics data after first network rendered
    if (loop && comicsReady === null) {
      comicsReady = false;
      loaderComics.style.display = "block";
      setTimeout(() => {
        fetch("./data/Marvel_comics.csv.gz")
          .then((res) => res.arrayBuffer())
          .then((content) => loadComics(content))
      }, selectedNodeLabel && selectedNodeType !== entity ? 100 : 2000);
    }

    // If a comic is selected we reload the list with it within it
    if (comicsBarView && selectedComic) {
      showCanvases();
      if (selectedNode)
        displayComics(selectedNode, true, true);
      else selectComic(selectedComic, true, true)
      return loop ? clearInterval(loop) : null;
    }

    // If a node is selected we refocus it
    if (selectedNodeLabel && selectedNodeType !== entity) {
      loadNetwork(selectedNodeType, "most", () => {
        showCanvases();
        clickNode(networks[selectedNodeType].most.graph.findNode((n, {label}) => label === selectedNodeLabel), false);
      }, true);
    } else {
      const node = selectedNodeLabel
        ? data.graph.findNode((n, {label}) => label === selectedNodeLabel)
        : null;
      if (node || selectedNode) {
        showCanvases();
        clickNode(node || selectedNode, false);
      } else {
        camera.animate({
          x: 0.5,
          y: 0.5,
          ratio: 1
        }, {duration: 50});
        setTimeout(() => {
          showCanvases();
          if (view === "pictures")
            renderer.setSetting("nodeReducer", (n, attrs) => ({ ...attrs, type: "image" }));
          hideLoader();
        }, 50);
      }
    }
    return loop ? clearInterval(loop) : null;
  }

  loader.style.opacity = "0.5";
  resize();
  // Zoom in graph on first init network
  if (!data.rendered) {
    camera.x = 0.5;
    camera.y = 0.5;
    camera.ratio = Math.pow(1.5, 10);
    camera.angle = 0;
    showCanvases(false);
    const initLoop = setInterval(() => {
      if (!camera) return clearInterval(initLoop);
      if (camera.ratio <= 1.5)
        return finalizeGraph(initLoop)
      camera.animate({ratio: camera.ratio / 1.5}, {duration: 50, easing: "linear"});
    }, 50);
    data.rendered = true;
  } else finalizeGraph();
}

// Center the camera on the selected node and its neighbors or a selected list of nodes
function centerNode(node, neighbors = null, force = true) {
  const data = networks[entity][networkSize];

  if (!camera || (!node && !neighbors)) return;
  if (!neighbors && data.graph.hasNode(node))
    neighbors = data.graph.neighbors(node);
  else if (!neighbors.length)
    neighbors = data.graph.nodes();
  if (node && neighbors.indexOf(node) === -1)
    neighbors.push(node);

  const recenter = function(duration) {
    let x0 = null, x1 = null, y0 = null, y1 = null;
    neighbors.forEach(n => {
        const pos = renderer.getNodeDisplayData(n);
        if (!pos) return;
        if (x0 === null || x0 > pos.x) x0 = pos.x;
        if (x1 === null || x1 < pos.x) x1 = pos.x;
        if (y0 === null || y0 > pos.y) y0 = pos.y;
        if (y1 === null || y1 < pos.y) y1 = pos.y;
      });
    const shift = comicsBar.getBoundingClientRect()["x"] && comicsBar.style.opacity !== "0"
      ? divWidth("comics-bar")
      : 0,
      minCorner = rotatePosition(renderer.framedGraphToViewport({x: x0, y: y0}), camera.angle),
      maxCorner = rotatePosition(renderer.framedGraphToViewport({x: x1, y: y1}), camera.angle),
      viewPortPosition = renderer.framedGraphToViewport({
        x: (x0 + x1) / 2,
        y: (y0 + y1) / 2
      }),
      sigmaDims = container.getBoundingClientRect();

    // Handle comicsbar hiding part of the graph
    sigmaDims.width -= shift;
    // Evaluate required zoom ratio
    let ratio = Math.min(
      35 / camera.ratio,
      Math.max(
        0.21 / camera.ratio,
        4 / 3 / Math.min(
          sigmaDims.width / Math.abs(maxCorner.x - minCorner.x),
          sigmaDims.height / Math.abs(minCorner.y - maxCorner.y)
        )
      )
    );

    // Evaluate acceptable window
    const minWin = rotatePosition({
      x: 0,
      y: 0
    }, camera.angle),
    maxWin = rotatePosition({
      x: sigmaDims.width,
      y: sigmaDims.height
    }, camera.angle),
    minPos = rotatePosition({
      x: sigmaDims.width / 6,
      y: sigmaDims.height / 6
    }, camera.angle),
    maxPos = rotatePosition({
      x: 5 * sigmaDims.width / 6,
      y: 5 * sigmaDims.height / 6
    }, camera.angle);

    // Zoom on node only if force, if nodes outside full window, if nodes are too close together, or if more than 1 node and outside acceptable window
    if (force ||
      minCorner.x < minWin.x || maxCorner.x > maxWin.x || maxCorner.y < minWin.y || minCorner.y > maxWin.y ||
      (ratio !== 0 && (ratio < 0.35)) ||
      (neighbors.length > 1 && (minCorner.x < minPos.x || maxCorner.x > maxPos.x || maxCorner.y < minPos.y || minCorner.y > maxPos.y))
    ) {
      viewPortPosition.x += ratio * shift / 2;
      camera.animate(
        {
          ...renderer.viewportToFramedGraph(viewPortPosition),
          ratio: camera.ratio * ratio
        },
        {duration: duration}
      );
    }
  }
  recenter(300);
}


/* -- Graph interactions -- */

function clickNode(node, updateURL = true, center = false) {
  let data = networks[entity][networkSize];
  if (!data.graph || !renderer) return;

  // Unselect previous node
  const sameNode = (node === selectedNode);
  if (selectedNode) {
    if (data.graph.hasNode(selectedNode))
      data.graph.setNodeAttribute(selectedNode, "highlighted", false)
    selectedNode = null;
  }

  if (!node || !sameNode) {
    nodeImg.src = "";
    modalImg.src = "";
  }
  // Reset unselected node view
  if (!node) {
    selectedNode = null;
    selectedNodeType = null;
    selectedNodeLabel = null;
    if (updateURL)
      setURL(entity, networkSize, view, null, null);
    selectSuggestions.selectedIndex = 0;
    defaultSidebar();
    renderer.setSetting("nodeReducer", (n, attrs) => (view === "pictures" ? { ...attrs, type: "image" } : attrs));
    renderer.setSetting("edgeReducer", (edge, attrs) => attrs);
    renderer.setSetting("labelColor", view === "pictures" ? {attribute: 'hlcolor'} : {color: '#999'});
    return;
  }

  let relatedNodes = null;
  if (selectedNodeType && selectedNodeType !== entity && !data.graph.hasNode(node)) {
    data = networks[selectedNodeType].most;
    relatedNodes = Array.from(crossMap[entity][node] || []);
  }

  if (!data.graph.hasNode(node))
    return setURL(entity, networkSize, view, null, null);

  if (updateURL && !sameNode)
    setURL(entity, networkSize, view, data.graph.getNodeAttribute(node, "label"), entity);

  // Fill sidebar with selected node's details
  const attrs = data.graph.getNodeAttributes(node);
  selectedNode = node;
  selectedNodeLabel = attrs.label;
  explanations.style.display = "none";
  nodeDetails.style.display = "block";
  if (!sameNode) {
    nodeDetails.scrollTo(0, 0);
    nodeLabel.innerHTML = attrs.label;
    nodeImg.src = attrs.image_url.replace(/^http:/, '');
    nodeImg.onclick = () => {
      modalImg.src = attrs.image_url.replace(/^http:/, '');
      stopPlayComics();
      modal.style.display = "block";
      modalPrev.style.opacity = "0";
      modalNext.style.opacity = "0";
      modalPlay.style.display = "none";
      modalPause.style.display = "none";
    };

    nodeExtra.innerHTML = "";
    if (attrs.description)
      nodeExtra.innerHTML += "<p>" + attrs.description + "</p>";
    nodeExtra.innerHTML += "<p>" + (entity === "creators" ? "Credit" : "Account") + "ed in <b>" + attrs.stories + " stories</b> shared with<br/><b>" + data.graph.degree(node) + " other " + entity + "</b></p>";
    // Display roles in stories for creators
    if (entity === "creators") {
      if (attrs.writer === 0 && attrs.artist)
        nodeExtra.innerHTML += '<p>Always as <b style="color: ' + creatorsRoles.artist + '">artist (' + attrs.artist + ')</b></p>';
      else if (attrs.artist === 0 && attrs.writer)
        nodeExtra.innerHTML += '<p>Always as <b style="color: ' + creatorsRoles.writer + '">writer (' + attrs.writer + ')</b></p>';
      else nodeExtra.innerHTML += '<p>Including <b style="color: ' + creatorsRoles.writer + '">' + attrs.writer + ' as writer</b><br/>and <b style="color: ' + creatorsRoles.artist + '">' + attrs.artist + " as artist</b></p>";
    }
    // Or communities if we have it for characters
    else if (data.communities[attrs.community])
      nodeExtra.innerHTML += '<p>Attached to the <b style="color: ' + data.communities[attrs.community].color + '">' + data.communities[attrs.community].label + '</b> community<sup class="asterisk">*</sup></p>';
    if (attrs.url)
      nodeExtra.innerHTML += '<p><a href="' + attrs.url + '" target="_blank">More on Marvel.com…</a></p>';
    if (comicsReady)
      addViewComicsButton(node);
  }

  if (!comicsBarView || !selectedComic) {
    if (relatedNodes === null) {
      // Highlight clicked node and make it bigger always with a picture and hide unconnected ones
      data.graph.setNodeAttribute(node, "highlighted", true);
      renderer.setSetting(
        "nodeReducer", (n, attrs) => n === node
          ? { ...attrs,
              type: "image",
              zIndex: 2,
              size: attrs.size * 1.75,
              hlcolor: "#ec1d24"
            }
          : data.graph.hasEdge(n, node)
            ? { ...attrs,
                type: view === "pictures" ? "image" : "circle",
                zIndex: 1,
                hlcolor: null
              }
            : { ...attrs,
                type: "circle",
                zIndex: 0,
                color: "#2A2A2A",
                size: sigmaDim / 350,
                label: null
              }
      );
      // Hide unrelated links and highlight, weight and color as the target the node's links
      renderer.setSetting(
        "edgeReducer", (edge, attrs) =>
          data.graph.hasExtremity(edge, node)
            ? { ...attrs,
                zIndex: 0,
                color: lightenColor(data.graph.getNodeAttribute(data.graph.opposite(node, edge), 'color'), 75),
                size: Math.max(1, Math.log(data.graph.getEdgeAttribute(edge, 'weight')) * sigmaDim / 5000)
              }
            : { ...attrs,
                zIndex: 0,
                color: "#FFF",
                hidden: true
              }
      );
    } else {
      // Display the alternate entity graph for the selected node
      renderer.setSetting(
        "nodeReducer", (n, attrs) => relatedNodes.indexOf(n) !== -1
          ? { ...attrs,
              type: view === "pictures" ? "image" : "circle",
              zIndex: 2
            }
          : { ...attrs,
              type: "circle",
              zIndex: 0,
              color: "#2A2A2A",
              size: sigmaDim / 500,
              label: null
            }
      );
      renderer.setSetting(
        "edgeReducer", (edge, attrs) =>
          relatedNodes.indexOf(networks[entity][networkSize].graph.source(edge)) !== -1 &&
          relatedNodes.indexOf(networks[entity][networkSize].graph.target(edge)) !== -1
            ? { ...attrs,
                zIndex: 0,
                color: '#222',
                size: 1
              }
            : { ...attrs,
                zIndex: 0,
                color: "#FFF",
                hidden: true
              }
      );
    }

    renderer.setSetting(
      "labelColor", {attribute: "hlcolor", color: "#CCC"}
    );
  }

  if (comicsBarView && !sameNode)
    displayComics(node, true);
  else if (!updateURL || center)
    setTimeout(() => {
      if (relatedNodes)
        centerNode(null, relatedNodes);
      else centerNode(node);
      hideLoader();
    }, 50);
  else hideLoader();

  if (!sameNode)
    comicsDiv.scrollTo(0, 0);
};

function displayComics(node, autoReselect = false, resetTitle = true) {
  const graph = networks[entity][networkSize].graph;
  const comics = getNodeComics(node)

  comicsBarView = true;
  comicsBar.style.opacity = "1";
  comicsBar.style["z-index"] = "1";
  hideViewComicsButton();

  comicsCache.style.display = "none";

  if ((selectedNode && creatorsComics[selectedNode]) || (!selectedNode && entity === "creators"))
    document.getElementById("clusters-layer").style.display = "none";
  if (resetTitle) {
    comicsTitle.innerHTML = "";
    if (comics) {
      comicsTitle.innerHTML = "... comics";
      if (selectedNodeLabel) comicsTitle.innerHTML += " " + (creatorsComics[selectedNode] ? "by" : "with") + "<br/>" + selectedNodeLabel;
    }
    comicsSubtitleList.innerHTML = "";
  }
  comicsSubtitle.style.display = (selectedNode && creatorsComics[selectedNode] ? "inline" : "none");

  comicsList.innerHTML = "";
  if (comics && comics.length > 500)
    loaderList.style.display = "block";
  if (autoReselect)
    selectComic(
      (selectedComic && comics.filter(c => c.id === selectedComic.id).length
        ? selectedComic
        : null),
      true,
      autoReselect
    );
  setTimeout(() => {
    const fullList = comics
      ? comics.sort(sortComics === "date" ? sortByDate : sortByTitle)
      : [];
    const filteredList = filterComics.className === "selected" && filterInput.value
      ? fullList.filter(c => c.title.toLowerCase().indexOf(filterInput.value.toLowerCase()) !== -1)
      : fullList;
      //.filter(c => (entity === "characters" && c.characters.length) || (entity === "creators" && c.creators.length));

    (selectedNode ? nodeHistogram : fullHistogram).innerHTML = renderHistogram(selectedNode, filteredList);

    if (filteredList.length) {
      comicsTitle.innerHTML = formatNumber(filteredList.length) + " comic" + (filteredList.length > 1 ? "s" : "");
      if (selectedNodeLabel) comicsTitle.innerHTML += " " + (creatorsComics[selectedNode] ? "by" : "with") + "<br/>" + selectedNodeLabel;
      if (selectedNodeLabel && creatorsComics[selectedNode])
        comicsSubtitleList.innerHTML = Object.keys(creatorsRoles)
          .map(x => '<span style="color: ' + lightenColor(creatorsRoles[x], 50) + '">' + x + '</span>')
          .join("&nbsp;")
          .replace(/&nbsp;([^&]+)$/, " or $1");
    }

    setTimeout(() => {
      comicsList.innerHTML = filteredList.length
        ? filteredList.map(x => '<li id="comic-' + x.id + '"' + (selectedNodeLabel && creatorsComics[selectedNode] ? ' style="color: ' + lightenColor(creatorsRoles[x.role], 50) + '"' : "") + (selectedComic && x.id === selectedComic.id ? ' class="selected"' : "") + '>' + x.title + "</li>")
          .join("")
        : "No comic-book found.";
      filteredList.forEach(c => {
        const comicLi = document.getElementById("comic-" + c.id) as any;
        comicLi.comic = c;
        comicLi.onmouseup = () => selectComic(c, true);
        comicLi.onmouseenter = () => selectComic(c);
      });
      loaderList.style.display = "none";
      if (autoReselect) {
        if (selectedComic) scrollComicsList();
        comicsCache.style.display = "none";
      }
      resize(true);
    }, 200);
  }, 200);
}

viewAllComicsButton.onclick = () => displayComics(null);

function unselectComic() {
  const graph = networks[entity][networkSize].graph;
  hoveredComic = null;
  selectedComic = null;
  selectComic(null, true);
  renderer.setSetting("labelGridCellSize", sigmaSettings.labelGridCellSize);
  if (selectedNode) {
    clickNode(selectedNode, false, true);
  } else clickNode(null, false);
}

function selectComic(comic = null, keep = false, autoReselect = false) {
  const graph = networks[entity][networkSize].graph;
  if (!graph || !renderer) return;

  if (!autoReselect) {
    if (keep && comic && selectedComic && comic.id === selectedComic.id) {
      comic = null;
      unselectComic();
    }

    if (!comic || !hoveredComic || comic.id !== hoveredComic.id) {
      comicTitle.innerHTML = "";
      comicImg.src = "";
      comicDesc.innerHTML = "";
      comicEntities.forEach(el => el.style.display = "none");
      comicCreators.innerHTML = "";
      comicCharacters.innerHTML = "";
      comicUrl.style.display = "none";
    }
  }

  if (keep) {
    selectedComic = comic;
    document.querySelectorAll("#comics-list li.selected").forEach(
      el => el.className = ""
    );
    const comicLi = document.getElementById("comic-" + (comic ? comic.id : ""));
    if (comicLi) {
      comicLi.className = "selected";
      comicsCache.style.display = "block";
      modalPrev.style.opacity = comicLi.previousElementSibling === null ? "0" : "1";
      modalNext.style.opacity = comicLi.nextElementSibling === null ? "0" : "1";
    }
  } else hoveredComic = comic;

  if (comic && selectedNode && graph.hasNode(selectedNode))
    graph.setNodeAttribute(selectedNode, "highlighted", false)

  if (!comic || !selectedComic || comic.id !== selectedComic.id)
    document.getElementById("comic-details").scrollTo(0, 0);

  if (!comic) {
    if (!keep && selectedComic && autoReselect)
      selectComic(selectedComic);
    return;
  }

  comicTitle.innerHTML = formatMonth(comic.date);
  comicImg.src = comic.image_url.replace(/^http:/, '');
  modalImg.src = comic.image_url.replace(/^http:/, '');
  comicImg.onclick = () => {
    modalImg.src = comic.image_url.replace(/^http:/, '');
    modal.style.display = "block";
    modalPlay.style.display = playing ? "none" : "inline-block";
    modalPause.style.display = playing ? "inline-block" : "none";
    const comicLi = document.getElementById("comic-" + comic.id);
    modalPrev.style.opacity = comicLi.previousElementSibling === null ? "0" : "1";
    modalNext.style.opacity = comicLi.nextElementSibling === null ? "0" : "1";
  }
  comicDesc.innerHTML = comic.description;
  comicUrl.style.display = "inline";
  comicUrl.href = comic.url;

  comicEntities.forEach(el => el.style.display = "block");
  comicCreators.innerHTML = (comic.writers.length ? comic.writers : ["-1"])
    .map(x => allCreators[x]
      ? '<li id="creator-' + x + '" ' +
        (x !== "-1" ? 'class="entity-link" ' : '') +
        'title="writer" ' +
        'style="color: ' + lightenColor(creatorsRoles["writer"], 50) + '">' +
        allCreators[x] + "</li>"
      : ""
    ).join("");
  comicCreators.innerHTML += (comic.artists.length ? comic.artists : ["-1"])
    .map(x => allCreators[x]
      ? '<li id="creator-' + x + '" ' +
        (x !== "-1" ? 'class="entity-link" ' : '') +
        'title="artist" ' +
        'style="color: ' + lightenColor(creatorsRoles["artist"], 50) + '">' +
        allCreators[x] + "</li>"
      : ""
    ).join("");
  comicCharacters.innerHTML = (comic.characters.length ? comic.characters : ["-1"])
    .map(x => allCharacters[x]
      ? '<li id="character-' + x + '" ' +
        (x !== "-1" ? 'class="entity-link" ' : '') + '>' +
        allCharacters[x] + "</li>"
      : ""
    ).join("");

  comic.creators.forEach(c => {
    if (!allCreators[c]) return;
    const entityLi = document.getElementById("creator-" + c) as HTMLElement;
    entityLi.onclick = () => setURL(entity, networkSize, view, allCreators[c], "creators");
  });
  comic.characters.forEach(c => {
    if (!allCharacters[c]) return;
    const entityLi = document.getElementById("character-" + c) as HTMLElement;
    entityLi.onclick = () => setURL(entity, networkSize, view, allCharacters[c], "characters");
  });

  renderer.setSetting(
    "nodeReducer", (n, attrs) => comic[entity].indexOf(n) !== -1
      ? { ...attrs,
          zIndex: 2,
          size: attrs.size * 1.75,
          type: view === "pictures" ? "image" : "circle"
        }
      : { ...attrs,
          zIndex: 0,
          color: "#2A2A2A",
          type: "circle",
          size: sigmaDim / 500,
          label: null
        }
  );
  renderer.setSetting(
    "edgeReducer", (edge, attrs) =>
      comic[entity].indexOf(graph.source(edge)) !== -1 && comic[entity].indexOf(graph.target(edge)) !== -1
      ? { ...attrs,
          zIndex: 0,
          color: '#333',
          size: sigmaDim < 500 ? 1 : 3
        }
      : { ...attrs,
          zIndex: 0,
          color: "#FFF",
          hidden: true
        }
  );
  renderer.setSetting("labelGridCellSize", 10);

  setTimeout(() => {
    centerNode(null, comic[entity].filter(n => graph.hasNode(n)), false);
    hideLoader();
  }, 50);
}

// Random node button
document.getElementById("view-node").onclick = () => {
  const graph = networks[entity][networkSize].graph;
  if (!graph || !renderer)
    return;
  const node = graph.nodes()[Math.floor(Math.random() * graph.order)];
  if (selectedComic) unselectComic();
  clickNode(node, true, true);
}

// Fullscreen button
const win = document.documentElement as any,
  fullScreenBtn = document.getElementById("fullscreen") as HTMLButtonElement,
  regScreenBtn = document.getElementById("regscreen") as HTMLButtonElement;

fullScreenBtn.onclick = () => {
  if (win.requestFullscreen) {
    win.requestFullscreen();
  } else if (win.webkitRequestFullscreen) { /* Safari */
    win.webkitRequestFullscreen();
  } else if (win.msRequestFullscreen) { /* IE11 */
    win.msRequestFullscreen();
  }
  fullScreenBtn.style.display = "none";
  regScreenBtn.style.display = "block";
};

// Exit Fullscreen button
regScreenBtn.onclick = () => {
  if ((document as any).exitFullscreen) {
    (document as any).exitFullscreen();
  } else if ((document as any).webkitExitFullscreen) { /* Safari */
    (document as any).webkitExitFullscreen();
  } else if ((document as any).msExitFullscreen) { /* IE11 */
    (document as any).msExitFullscreen();
  }
  regScreenBtn.style.display = "none";
  fullScreenBtn.style.display = "block";
};

// Network switch buttons
switchNodeType.onchange = (event) => {
  const target = event.target as HTMLInputElement;
  explanations.style.opacity = "0";
  setURL(target.checked ? "creators" : "characters", networkSize, view, selectedNodeLabel, selectedNodeType);
};

switchNodeFilter.onchange = (event) => {
  const target = event.target as HTMLInputElement;
  explanations.style.opacity = "0";
  setURL(entity, target.checked ? "most" : "main", view, selectedNodeLabel, selectedNodeType);
};

switchNodeView.onchange = (event) => {
  const target = event.target as HTMLInputElement;
  setURL(entity, networkSize, target.checked ? "colors" : "pictures", selectedNodeLabel, selectedNodeType);
};


/* -- Interface display -- */

function showCanvases(showClustersLayer = true) {
  (document.querySelectorAll(".sigma-container canvas") as NodeListOf<HTMLElement>).forEach(canvas => canvas.style.display = "block");
  if (showClustersLayer && clustersLayer && entity === "creators")
    clustersLayer.style.display = "block";
}

function hideLoader() {
  if (view === "pictures")
    return setTimeout(() => {
      loader.style.display = "none";
      loader.style.opacity = "0";
      picturesRenderingDelay[entity] = Math.min(picturesRenderingDelay[entity],
        networkSize === "most" ? 0 : picturesLoadingDelay / 2);
    }, picturesRenderingDelay[entity]);
  loader.style.display = "none";
  loader.style.opacity = "0";
}

function defaultSidebar() {
  explanations.style.display = "block";
  nodeDetails.style.display = "none";
  modal.style.display = "none";
  modalImg.src = "";
}

function hideComicsBar() {
  if (filterComics.className === "selected") {
    filterComics.className = "";
    filterSearch.style.display = "none";
    (selectedNode ? nodeHistogram : fullHistogram).innerHTML = renderHistogram(selectedNode);
  }
  comicsCache.style.display = "none";
  comicsBarView = false;
  comicsBar.style.opacity = "0";
  comicsBar.style["z-index"] = "-1";
  modalNext.style.opacity = "0";
  modalPrev.style.opacity = "0";
  resize(true);
  showViewComicsButton();
  unselectComic();
  if (entity === "creators" && clustersLayer)
    clustersLayer.style.display = "block";
}

document.getElementById("close-bar").onclick = hideComicsBar;

function addViewComicsButton(node) {
  nodeExtra.innerHTML += '<p id="view-comics"><span>Explore comics</span></p>';
  document.getElementById('view-comics').onclick = () => displayComics(node);
  nodeHistogram.innerHTML = renderHistogram(node);
}

function showViewComicsButton() {
  (document.querySelectorAll('#view-comics, #view-all-comics') as NodeListOf<HTMLElement>).forEach(
    el => el.className = ""
  );
}

function hideViewComicsButton() {
  (document.querySelectorAll('#view-comics, #view-all-comics') as NodeListOf<HTMLElement>).forEach(
    el => el.className = "view-comics-selected"
  );
}


/* -- Comics bar interactions -- */

// Next/Previous/Play/Pause comics buttons handling
function scrollComicsList() {
  setTimeout(() => {
    const offset = document.querySelector("#comics-list li.selected") as HTMLElement;
    if (!offset) return;
    const offsetHeight = offset.getBoundingClientRect().height,
      listHeight = divHeight("comics");
    let diff = listHeight < 4 * offsetHeight
      ? listHeight + offsetHeight
      : listHeight / 2 + offsetHeight / 2;
    comicsDiv.scrollTo(0, offset.offsetTop - diff);
  }, 10);
}

function selectAndScroll(el) {
  if (!el) return;
  selectComic(el.comic, true);
  scrollComicsList();
}

function selectAndScrollSibling(typ, loop = false) {
  if (!comicsBarView) return;
  const selected = document.querySelector("#comics-list li.selected") as any;
  let target = selected && selected[typ + "ElementSibling"] as any;
  if (loop && !target)
    target = document.querySelector("#comics-list li:" + (typ === "next" ? "first" : "last") + "-child") as any;
  selectAndScroll(target);
  if (typ === "next" && playing && !target && !loop)
    modalPause.onclick(null);
}

function playComics() {
  comicsPlay.style.display = "none";
  comicsPause.style.display = "inline-block";
  modalPlay.style.display = "none";
  modalPause.style.display = "inline-block";
  if (playing) clearInterval(playing);
  selectAndScrollSibling("next", true);
  playing = setInterval(() => selectAndScrollSibling("next"), playComicsDelay);
}

function stopPlayComics() {
  comicsPause.style.display = "none";
  comicsPlay.style.display = "inline-block";
  modalPause.style.display = "none";
  modalPlay.style.display = "inline-block";
  if (playing) clearInterval(playing);
  playing = false;
}

// Comics list actions
comicsPlay.onclick = playComics;
comicsPause.onclick = stopPlayComics;
comicsPrev.onclick = () => selectAndScrollSibling("previous", true);
comicsNext.onclick = () => selectAndScrollSibling("next", true);

// Modal actions
let preventClick = false;
modalNext.onclick = () => {
  preventClick = true;
  selectAndScrollSibling("next");
};
modalPrev.onclick = () => {
  preventClick = true;
  selectAndScrollSibling("previous");
};
modalPlay.onclick = () => {
  preventClick = true;
  playComics()
}
modalPause.onclick = () => {
  preventClick = true;
  stopPlayComics();
}
modal.onclick = () => {
  if (preventClick) return preventClick = false;
  preventClick = false;
  modal.style.display = "none";
  comicsCache.style.display = "none";
};
modalImg.onclick = modal.onclick;
document.getElementById("close-modal").onclick = modal.onclick;

// Comics list scroll blocker after click handling
comicsList.onmouseleave = () => {
  if (selectedComic)
    selectComic(selectedComic);
  else unselectComic();
};

comicsCache.onwheel = () => comicsCache.style.display = "none";
comicsCache.onmousedown = comicsCache.onwheel;
comicsCache.onmouseout = comicsCache.onwheel;

// Sort comics buttons
const sortableTitle = s => s.replace(/^(.* \(\d+\)).*$/, "$1 / ") + s.replace(/^.*#(\d+.*)$/, "$1").padStart(8, "0"),
  sortByTitle = (a, b) => sortableTitle(a.title).localeCompare(sortableTitle(b.title)),
  sortByDate = (a, b) => a.date < b.date ? -1 : (a.date === b.date ? 0 : 1);

sortAlpha.onclick = () => {
  sortAlpha.disabled = true;
  sortDate.disabled = false;
  sortComics = "alpha";
  displayComics(selectedNode, true, false);
};

sortDate.onclick = () => {
  sortDate.disabled = true;
  sortAlpha.disabled = false;
  sortComics = "date";
  displayComics(selectedNode, true, false);
};

// Search comics input
let filterTimeout = null;

function refreshFilter() {
  if (filterTimeout)
    clearTimeout(filterTimeout);
  filterTimeout = setTimeout(() => {
    displayComics(selectedNode, true, false);
    filterTimeout = null;
  }, 200);
}

filterComics.onclick = () => {
  if (filterComics.className === "selected") {
    filterComics.className = "";
    filterSearch.style.display = "none";
  } else {
    filterSearch.style.display = "block";
    filterComics.className = "selected";
  }
  resize(true);
  if (filterInput.value)
    refreshFilter();
}

filterInput.oninput = refreshFilter;


/* -- Keystrokes (Esc & Arrow keys) handling -- */

document.onkeydown = function(e) {
  const graph = networks[entity][networkSize].graph;
  if (!graph || !renderer) return

  if (searchInput === document.activeElement || filterInput === document.activeElement)
    return
  if (modal.style.display === "block" && e.which === 27) {
    modal.style.display = "none";
    comicsCache.style.display = "none";
  } else if (comicsBarView && !selectedComic) {
    if (e.which === 37 || e.which === 38)
      selectAndScroll(document.querySelector("#comics-list li:last-child") as any);
    else if (e.which === 39 || e.which === 40)
      selectAndScroll(document.querySelector("#comics-list li:first-child") as any);
    else if (e.which === 27)
      hideComicsBar();
    else return;
  } else if (selectedComic) {
    switch(e.which) {
      case 37: // left
        selectAndScrollSibling("previous");
        break;
      case 38: // up
        selectAndScrollSibling("previous");
        break;

      case 39: // right
        selectAndScrollSibling("next");
        break;
      case 40: // down
        selectAndScrollSibling("next");
        break;

      case 27: // esc
        unselectComic();
        break;

      default: return; // exit this handler for other keys
    }
  } else if (e.which === 27) {
    if (comicsBarView)
      hideComicsBar();
    else if (selectedNode)
      clickNode(null);
    else return;
  } else return;
  e.preventDefault(); // prevent the default action (scroll / move caret)
};


/* -- Swipe touch handling -- */

let touches = {x: [0, 0], y: [0, 0]};

function touchStart(e) {
  touches.x[0] = e.changedTouches[0].screenX;
  touches.y[0] = e.changedTouches[0].screenY;
};
modal.ontouchstart = touchStart;
comicImg.ontouchstart = touchStart;
switchTypeLabel.ontouchstart = touchStart;
switchViewLabel.ontouchstart = touchStart;
switchFilterLabel.ontouchstart = touchStart;

function touchEnd(e, threshold = 100) {
  touches.x[1] = e.changedTouches[0].screenX;
  touches.y[1] = e.changedTouches[0].screenY;
  const horizontalDifference = touches.x[1] - touches.x[0],
    verticalDifference = touches.y[1] - touches.y[0];
  // Horizontal difference dominates
  if (Math.abs(horizontalDifference) > Math.abs(verticalDifference)) {
    if (horizontalDifference >= threshold)
      return "left";
    else if (horizontalDifference <= -threshold)
      return "right";
  // Vertical difference dominates
  } else if (verticalDifference >= threshold)
    return "up";
  else if (verticalDifference <= -threshold)
    return "down";
  return "";
};

modal.ontouchend = e => {
  const typ = touchEnd(e);
  if (typ === "left" || typ === "up")
    selectAndScrollSibling("previous");
  else if (typ === "right" || typ === "down")
    selectAndScrollSibling("next");
};

comicImg.ontouchend = e => {
  const typ = touchEnd(e, 30);
  if (typ === "left")
    selectAndScrollSibling("previous");
  else if (typ === "right")
    selectAndScrollSibling("next");
};

switchTypeLabel.ontouchend = e => {
  const typ = touchEnd(e, 20);
  if (typ === "left" || typ === "right") {
    switchNodeType.checked = !switchNodeType.checked;
    setURL(switchNodeType.checked ? "creators" : "characters", networkSize, view, selectedNodeLabel, selectedNodeType);
  }
};

switchFilterLabel.ontouchend = e => {
  const typ = touchEnd(e, 20);
  if (typ === "left" || typ === "right") {
    switchNodeFilter.checked = !switchNodeFilter.checked;
    setURL(entity, switchNodeFilter.checked ? "most" : "main", view, selectedNodeLabel, selectedNodeType);
  }
};

switchViewLabel.ontouchend = e => {
  const typ = touchEnd(e, 0);
  if (typ === "left" || typ === "right") {
    switchNodeView.checked = !switchNodeView.checked;
    setURL(entity, networkSize, switchNodeView.checked ? "colors" : "pictures", selectedNodeLabel, selectedNodeType);
  }
};


/* -- Comics histogram timeline -- */

function buildLegendItem(year, ref = "") {
  let className = '',
    color = '';
  if (ref !== "start" && year !== startYear && year !== curYear)
    className = ' class="hidable"';
  if (ref === "start")
    color = '; color: var(--marvel-red-light)';
  else if (ref === "old")
    color = '; color: #555';
  return '<div style="left: calc((100% - 25px) * ' + Math.round(1000 * (year - startYear) / totalYears) / 1000 + ')' +
    color + '"' + className + '>' + year + '</div>';
}

function buildHistogram(comics) {
  const histo = {
    values: new Array(totalYears).fill(0),
    start: curYear
  };
  comics.forEach(c => {
    const comicYear = (new Date(c.date)).getFullYear();
    if (!comicYear) return;
    histo.values[comicYear - startYear] += 1;
    histo.start = Math.min(histo.start, comicYear);
  });
  return histo;
}

function renderHistogram(node = null, comics = null) {
  const histogram = comics === null && histograms[entity][node]
    ? histograms[entity][node]
    : buildHistogram(comics || getNodeComics(node));
  if (comics === null && !histograms[entity][node])
    histograms[entity][node] = histogram;

  const heightRatio = 25 / Math.max.apply(Math, histogram.values),
    barWidth = Math.round(1000 * divWidth("node-extra") / totalYears) / 1000;
  let histogramDiv = '<div id="histogram">';
  histogram.values.forEach((y, idx) => histogramDiv +=
    '<span class="histobar" ' +
      'title="' + y + ' comic' + (y > 1 ? 's' : '') + ' in ' + (startYear + idx) + '" ' +
      'style="width: calc(100% / ' + totalYears + '); ' +
        'height: ' + Math.round(y * heightRatio) + 'px">' +
    '</span>'
  );
  histogramDiv += '</div><div id="histo-legend">';

  const legendYears = [startYear, 1960, 1980, 2000, curYear];
  if (legendYears.indexOf(histogram.start) === -1)
    legendYears.push(histogram.start);
  legendYears.sort().forEach(y => {
    if (y + 12 < histogram.start)
      histogramDiv += buildLegendItem(y, "old")
    else if (y - 12 > histogram.start)
      histogramDiv += buildLegendItem(y);
    else if (y === histogram.start)
      histogramDiv += buildLegendItem(histogram.start, "start");
  });
  histogramDiv += '</div>';
  return histogramDiv;
}


/* -- Responsiveness handling -- */

let resizing = undefined;

function resize(fast = false) {
  if (!fast) resizing = true;
  const graph = entity ? networks[entity][networkSize].graph : null,
    freeHeight = divHeight("sidebar") - divHeight("header") - divHeight("credits") - divHeight("credits-main") - 10;
  explanations.style.opacity = "1"
  explanations.style.height = freeHeight + "px";
  explanations.style["min-height"] = freeHeight + "px";
  nodeDetails.style.height = (freeHeight + 10) + "px";
  nodeDetails.style["min-height"] = (freeHeight + 10) + "px";
  comicsDiv.style.height = divHeight("comics-bar") - divHeight("comics-header") - divHeight("comic-details") - 11 + "px";
  loader.style.transform = (comicsBarView && comicsBar.getBoundingClientRect().x !== 0 ? "translateX(-" + divWidth("comics-bar") / 2 + "px)" : "");
  const comicsDims = comicsDiv.getBoundingClientRect();
  ["width", "height", "top"].forEach(k =>
    comicsCache.style[k] = comicsDims[k] + "px"
  );
  const sigmaDims = container.getBoundingClientRect();
  sigmaDim = Math.min(sigmaDims.height, sigmaDims.width);
  if (!fast && renderer && graph && camera) {
    const ratio = Math.pow(1.1, Math.log(camera.ratio) / Math.log(1.5));
    renderer.setSetting("labelRenderedSizeThreshold", ((networkSize === "main" ? 6 : 4) + (entity === "characters" ? 1 : 0.5)) * sigmaDim / 1000);
    graph.forEachNode((node, {stories}) =>
      graph.setNodeAttribute(node, "size", computeNodeSize(node, stories))
    );
  }
  if (!fast) resizing = false;
}

window.onresize = () => {
  if (resizing === true) return;
  if (resizing) clearTimeout(resizing);
  resizing = setTimeout(resize, 0);
};


/* -- URL actions routing -- */

function setURL(ent, siz, vie, sel, selType) {
  window.location.hash = siz + "/" + ent + "/" + vie + "/"
    + (sel !== null ? "?" + (selType || ent).replace(/s$/, "") + "=" + sel.replace(/ /g,"+") : "");
}

function readURL() {
  const args = window.location.hash
    .replace(/^#/, '')
    .split(/\/\??/);
  if (args.length < 4
    || ["main", "most"].indexOf(args[0]) === -1
    || ["characters", "creators"].indexOf(args[1]) === -1
    || ["pictures", "colors"].indexOf(args[2]) === -1
  ) return setURL("characters", "main", "pictures", null, null);
  const opts = Object.fromEntries(
    args[3].split("&")
    .map(o => o.split("="))
    .filter(o => ["creator", "character", "comics"].indexOf(o[0]) !== -1)
  );

  const reload = args[1] !== entity || args[0] !== networkSize,
    switchv = args[2] !== view;

  const oldNodeLabel = selectedNodeLabel;
  selectedNodeLabel = null;
  ["character", "creator"].forEach(e => {
    if (opts[e]) {
      selectedNodeType = e + "s";
      selectedNodeLabel = decodeURIComponent(opts[e].replace(/\+/g, " "));
      searchInput.value = selectedNodeLabel;
    }
  });
  const clickn = selectedNodeLabel !== oldNodeLabel;

  // Update titles
  let title = "ap of Marvel's " + args[0] + " " + args[1] + " featured together within same&nbsp;comics";
  if (selectedNodeLabel)
    title += " " + (selectedNodeType === args[1]
      ? "as"
      : (selectedNodeType === "creators"
        ? "from"
        : "casting")) + " ";
  document.querySelector("title").innerHTML = "MARVEL-graphs.net &mdash; M" + title + (selectedNode ? selectedNodeLabel : "");
  document.getElementById("title").innerHTML = "Here is a m" + title;

  if (reload) {
    // Hide canvases
    (document.querySelectorAll(".sigma-container canvas") as NodeListOf<HTMLElement>).forEach(canvas => canvas.style.display = "none");
    if (clustersLayer) {
      clustersLayer.innerHTML = "";
      clustersLayer.style.display = "none";
    }
    loader.style.opacity = "1";
    loader.style.display = "block";

    // Clear highlighted node from previous graph so it won't remain further on
    if (entity && selectedNode) {
      const prevGraph = networks[entity][networkSize].graph;
      if (prevGraph && prevGraph.hasNode(selectedNode))
        prevGraph.setNodeAttribute(selectedNode, "highlighted", false);
    }

    // Setup Sidebar default content
    orderSpan.innerHTML = '...';

    if (args[1] === "creators")
      Object.keys(creatorsRoles).forEach(k => {
        const role = document.getElementById(k + "-color");
        role.style.color = creatorsRoles[k];
        role.innerHTML = k + " (...)";
      });
    else document.querySelectorAll("#clusters-legend .color")
      .forEach(el => el.innerHTML = "...");
  }

  // Setup Size filter switch
  switchNodeFilter.checked = args[0] === "most";
  networkSize = args[0];
  mainDetailsSpans.forEach(span => span.style.display = (networkSize === "main" ? "inline" : "none"));
  mostDetailsSpans.forEach(span => span.style.display = (networkSize === "most" ? "inline" : "none"));

  // Setup Node type switch
  switchNodeType.checked = args[1] === "creators";
  entity = args[1];
  entitySpans.forEach(span => span.innerHTML = entity);
  charactersDetailsSpans.forEach(span => span.style.display = (entity === "characters" ? "inline-block" : "none"));
  creatorsDetailsSpans.forEach(span => span.style.display = (entity === "creators" ? "inline-block" : "none"));
  document.getElementById("min-stories").innerHTML = conf["min_stories_for_" + entity];
  document.getElementById("cooccurrence-threshold").innerHTML = conf["cooccurrence_threshold_for_" + entity];

  // Setup View switch
  switchNodeView.checked = args[2] === "colors";
  view = args[2];
  colorsDetailsSpans.forEach(span => span.style.display = (view === "colors" ? "inline" : "none"));
  picturesDetailsSpans.forEach(span => span.style.display = (view === "pictures" ? "inline" : "none"));

  const graph = networks[entity][networkSize].graph;
  if (reload) setTimeout(() => {
    // If graph already loaded, just render it
    if (graph)
      renderNetwork();
    // Otherwise load network file
    else loadNetwork(entity, networkSize, renderNetwork);
  }, 0);
  else if (switchv) {
    if (graph && renderer) {
      loader.style.display = "block";
      loader.style.opacity = "0.5";

      setTimeout(() => {
        renderer.setSetting("nodeReducer", (n, attrs) => (view === "pictures" ? { ...attrs, type: "image" } : attrs));
        renderer.setSetting("edgeReducer", (edge, attrs) => attrs);
        renderer.setSetting("labelColor", view === "pictures" ? {attribute: 'hlcolor'} : {color: '#999'});
        if (graph && comicsBarView && selectedComic)
          selectComic(selectedComic, true, true);
        else if (graph && selectedNode)
          clickNode(selectedNode, false);
        else hideLoader();
      }, 10);
    }
  } else if (clickn) {
    let network = networks[entity][networkSize];
    if (selectedNodeType !== entity) {
      loadNetwork(selectedNodeType, "most", () => {
        clickNode(networks[selectedNodeType].most.graph.findNode((n, {label}) => label === selectedNodeLabel), false);
      }, true);
    } else clickNode(graph.findNode((n, {label}) =>label === selectedNodeLabel), false);
  }
}


/* -- Init app -- */

// Collect algo's metadata to feed explanations
fetch("./config.yml.example")
.then((res) => res.text())
.then((confData) => {
  confData.split("\n").forEach(line => {
    const keyval = line.split(/:\s*/);
    conf[keyval[0]] = keyval[1];
  });

  // Check WebGL
  if (!webGLSupport()) {
    document.getElementById("webgl-disclaimer").style.display = "block";
    return;
  }

  // Init graph with first url
  defaultSidebar();
  window.onhashchange = readURL;
  readURL();
});
