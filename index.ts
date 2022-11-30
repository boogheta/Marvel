/* TODO:
- mobiles fix:
  - forbid text selection
  - multiple clicks on toggles when touch
  - touchmove should follow across tooltips like histogram's
- Réseau au centre : il faudrait peut-être un petit texte donnant les interactions possibles (genre en bas à droite "click on a circle to see its related characters/artists")
- uniformize class action buttons/sigma
- reorder css
- handle mobile darkmodes diffs? cf branch nightmode
- reorga dossiers
- check bad data marvel :
  - http://gateway.marvel.com/v1/public/stories/186542/creators incoherent with https://www.marvel.com/comics/issue/84372/damage_control_2022_1
  - check why Tiomothy Truman has no comic
  - check why zoom on Spiderman 1602 only zooms on regular spiderman
  - test new spatialization graphology
 => scraper comics as counter-truth? :
  - select good creators fields
  - take from scraping good image url if /clean within (example https://www.marvel.com/comics/issue/51567/captain_britain_and_the_mighty_defenders_2015_1)
  - handle or drop missing dates?
  - rebuild characters network from comics instead of stories, ex: Silk
  - rebuild creators network from cleaned comics instead
  - filter imprint marvel
  - add cover artist in comics list, not in links used
 => one more check with takoyaki on authors/characters labels + readjust louvain after
- update screenshots
- auto data updates
IDEAS:
- remove most/main switch and only propose most?
- remove colors/avatars switch and use node borders with sigma3 instead?
- test large histogram
- make histogram brushable pour visualiser une partie du réseau correspondant à un subset d'années ? ou "playable" avec animation comme pour le détail d'un personnage ou d'un artiste ?
- add urlrooting for modal? and play?
- install app button?
- swipe images with actual slide effect?
- handle old browsers where nodeImages are full black (ex: old iPad)
- handle alternate phone browsers where sigma does not work, ex Samsung Internet on Android 8
- test bipartite network between authors and characters filtered by category of author
- build data on movies and add a switch
*/

import Papa from "papaparse";
import Graph from "graphology";
import { Sigma } from "./sigma.js";
import { Coordinates } from "./sigma.js/types";
import {
  logDebug,
  hasClass, addClass, rmClass, switchClass,
  formatNumber, formatMonth,
  lightenColor,
  meanArray,
  divWidth, divHeight,
  isTouchDevice, webGLSupport,
  rotatePosition,
  uncompress
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
  animation = null,
  clustersLayer = null,
  resizeClusterLabels = function() {},
  histograms = {
    characters: {},
    creators: {}
  },
  suggestions = [],
  comicsReady = null,
  comicsBarView = false,
  shift = 0,
  preventAutoScroll = false,
  minComicLiHeight = 100,
  hoveredComic = null,
  selectedComic = null,
  networksLoaded = 0,
  playing = null,
  sortComics = "date";

const conf = {},
  networks = {},
  picturesRenderingDelay = {},
  allComics = [],
  allComicsMap = {},
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
  helpButton = document.getElementById("help") as HTMLElement,
  helpModal = document.getElementById("help-modal") as HTMLElement,
  helpBox = document.getElementById("help-box") as HTMLElement,
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
  viewNodeButton = document.getElementById("view-node") as HTMLElement,
  viewComicsButton = document.getElementById("view-comics") as HTMLElement,
  viewAllComicsButton = document.getElementById("view-all-comics") as HTMLElement,
  orderSpan = document.getElementById("order") as HTMLElement,
  nodeDetails = document.getElementById("node-details") as HTMLElement,
  nodeLabel = document.getElementById("node-label") as HTMLElement,
  nodeImg = document.getElementById("node-img") as HTMLImageElement,
  nodeExtra = document.getElementById("node-extra") as HTMLElement,
  nodeHistogram = document.getElementById("node-histogram") as HTMLElement,
  fullHistogram = document.getElementById("full-histogram") as HTMLElement,
  comicsHistogram = document.getElementById("comics-histogram") as HTMLElement,
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
  globalTooltip = document.getElementById("tooltip") as HTMLElement,
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

  logDebug("LOAD NETWORK", {ent, siz});
  networks[ent][siz].loading = true;
  return fetch("./data/Marvel_" + ent + "_by_stories" + (siz === "main" ? "" : "_full") + ".json.gz")
    .then(res => res.arrayBuffer())
    .then(content => buildNetwork(content, ent, siz, callback, waitForComics));
}

function computeNodeSize(count) {
  return Math.pow(count, 0.2)
    * (entity === "characters" ? 1.75 : 1.25)
    * (networkSize === "main" ? 1.75 : 1.25)
    * sigmaDim / 1000
};

function buildNetwork(networkData, ent, siz, callback, waitForComics) {
  logDebug("BUILD GRAPH", {ent, siz});
  const data = networks[ent][siz];
  // Parse pako zipped graphology serialized network JSON
  uncompress(networkData, "inflate", graphData => {
    data.graph = Graph.from(JSON.parse(graphData));

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
      const artist_ratio = (ent === "creators" ? artist / (writer + artist) : null),
        role = artist_ratio !== null
          ? (artist_ratio > 0.65
            ? "artist"
            : (artist_ratio < 0.34
              ? "writer"
              : "both"
            )
          ) : null,
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
        size: computeNodeSize(stories),
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

function loadComics() {
  loaderComics.style.display = "block";
  logDebug("LOAD COMICS");
  fetch("./data/Marvel_comics.csv.gz")
    .then((res) => res.arrayBuffer())
    .then((data) => uncompress(data, "ungzip", buildComics));
}

function buildComics(comicsData) {
  Papa.parse(comicsData, {
    worker: true,
    header: true,
    skipEmptyLines: "greedy",
    step: function(c) {
      c = c.data;
      // Filter comics with missing date
      if (!(new Date(c.date)).getFullYear())
        return;
      allComics.push(c);
      allComicsMap[c.id] = c;

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
        else creatorsComics[cr].push({...c, "role": "writer"});
      });

      c.creators.forEach(cr => {
        c.characters.forEach(ch => {
          if (!crossMap.creators[ch])
            crossMap.creators[ch] = {};
          if (!crossMap.creators[ch][cr])
            crossMap.creators[ch][cr] = 0;
          crossMap.creators[ch][cr]++;
          if (!crossMap.characters[cr])
            crossMap.characters[cr] = {};
          if (!crossMap.characters[cr][ch])
            crossMap.characters[cr][ch] = 0;
          crossMap.characters[cr][ch]++;
        });
      });
    },
    complete: function() {
      comicsReady = true;
      if (selectedNode)
        setViewComicsButton(selectedNode);
      else {
        renderHistogram(fullHistogram);
        showViewComicsButton();
      }
      resize(true);
      ["creators", "characters"].forEach(e =>
        ["main", "most"].forEach(s => loadNetwork(e, s))
      );
    }
  });
}


/* -- Graphs display -- */

function renderNetwork(shouldComicsBarView) {
  logDebug("RENDER", {entity, networkSize, view, selectedNode, selectedNodeType, selectedNodeLabel, shouldComicsBarView, comicsBarView, selectedComic});
  const data = networks[entity][networkSize];

  // Feed communities size to explanations
  orderSpan.innerHTML = formatNumber(data.graph.order);
  if (entity === "creators") {
    Object.keys(creatorsRoles).forEach(k => {
      const role = document.getElementById(k + "-color");
      role.style.color = lightenColor(creatorsRoles[k]);
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
      if (comicsBarView && selectedComic)
        setURL(entity, networkSize, view, selectedNodeLabel, selectedNodeType, "", sortComics);
      else if (comicsBarView)
        setURL(entity, networkSize, view, selectedNodeLabel, selectedNodeType);
      else setSearchQuery();
    });

    // Bind zoom manipulation buttons
    camera = renderer.getCamera();
    document.getElementById("zoom-in").onclick =
      () => camera.animatedZoom({ duration: 600 });
    document.getElementById("zoom-out").onclick =
      () => camera.animatedUnzoom({ duration: 600 });
    document.getElementById("zoom-reset").onclick =
      () => camera.animatedReset({ duration: 300 });
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
  selectSuggestions.innerHTML = "<option>search…</option>" + allSuggestions
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
        clickNode(null, true, true);
      }
    } else if (selectedNode) {
      clickNode(null, true, true);
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

  // If a comic is selected we reload the list with it within it
  function conditionalOpenComicsBar() {
    if (shouldComicsBarView) {
      if (!comicsBarView)
        displayComics(selectedNode, true, true);
      else if (selectedComic) {
        selectedComic = allComicsMap[selectedComic] || selectedComic;
        selectComic(selectedComic, true, true);
      } else unselectComic();
    }
    hideLoader();
    enableSwitchButtons();
  }

  const sigmaWidth = divWidth("sigma-container");
  function finalizeGraph() {
    renderer.setSetting("nodeReducer", (n, attrs) => (view === "pictures" ? { ...attrs, type: "image" } : attrs));
    // If a node is selected we refocus it
    if (selectedNodeLabel && selectedNodeType !== entity)
      return loadNetwork(selectedNodeType, "most", () => {
        showCanvases();
        clickNode(networks[selectedNodeType].most.graph.findNode((n, {label}) => label === selectedNodeLabel), false, true);
        conditionalOpenComicsBar();
      }, true);
    const node = selectedNodeLabel
      ? data.graph.findNode((n, {label}) => label === selectedNodeLabel)
      : null;
    showCanvases();
    clickNode(node, false, true);
    conditionalOpenComicsBar();
  }

  loader.style.opacity = "0.5";
  resize();
  // Zoom in graph on first init network
  if (!data.rendered) {
    camera.x = 0.5 + (shift / (2 * sigmaWidth));
    camera.y = 0.5;
    camera.ratio = Math.pow(1.5, 10);
    camera.angle = 0;
    showCanvases(false);
    setTimeout(() => camera.animate(
      {ratio: sigmaWidth / (sigmaWidth - shift)},
      {duration: 1500},
      () => {
        finalizeGraph();
        // Load comics data after first network rendered
        if (comicsReady === null) {
          comicsReady = false;
          setTimeout(loadComics, 50);
        }
      }
    ), 50);
    data.rendered = true;
  } else finalizeGraph();
}

function updateShift() {
  shift = comicsBarView
    ? (comicsBar.getBoundingClientRect()["x"]
      ? divWidth("comics-bar")
      : divWidth("sidebar") - divWidth("comics-bar")
    ) : 0;
}

// Center the camera on the selected node and its neighbors or a selected list of nodes
function centerNode(node, neighbors = null, force = true) {
  // cancel pending centering
  if (animation)
    clearTimeout(animation);
  // stop already running centering by requesting an idle animation
  if (camera.isAnimated())
    camera.animate(
      camera.getState,
      {duration: 0},
    // then only compute positions to run new centering after a delay to filter out too close calls
      () => animation = setTimeout(() => runCentering(node, neighbors, force), 50)
    );
  else animation = setTimeout(() => runCentering(node, neighbors, force), 0);
}

function runCentering(node, neighbors = null, force = true) {
  logDebug("CENTER ON", {node, neighbors, force, shift, animation, animated: camera.isAnimated()});
  const data = networks[entity][networkSize];
  if (!camera || (!node && !neighbors)) return;
  if (!neighbors && data.graph.hasNode(node))
    neighbors = data.graph.neighbors(node);
  if (node && neighbors.indexOf(node) === -1)
    neighbors.push(node);
  if (!neighbors.length) {
    hideLoader();
    return;
  }

  let x0 = null, x1 = null, y0 = null, y1 = null;
  neighbors.forEach(n => {
      const pos = renderer.getNodeDisplayData(n);
      if (!pos) return;
      if (x0 === null || x0 > pos.x) x0 = pos.x;
      if (x1 === null || x1 < pos.x) x1 = pos.x;
      if (y0 === null || y0 > pos.y) y0 = pos.y;
      if (y1 === null || y1 < pos.y) y1 = pos.y;
    });
  const minCorner = rotatePosition(renderer.framedGraphToViewport({x: x0, y: y0}), camera.angle),
    maxCorner = rotatePosition(renderer.framedGraphToViewport({x: x1, y: y1}), camera.angle),
    viewPortPosition = renderer.framedGraphToViewport({
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2
    }),
    sigmaDims = container.getBoundingClientRect();

  // Handle comicsbar hiding part of the graph
  updateShift();
  sigmaDims.width -= shift;
  // Evaluate required zoom ratio
  let ratio = Math.min(
    50 / camera.ratio,
    Math.max(
      1.5 * renderer.getSetting("minCameraRatio") / camera.ratio,
      1.5 / Math.min(
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
    (ratio !== 0 && (ratio < 0.7 || ratio > 1.55)) ||
    (neighbors.length > 1 && (minCorner.x < minPos.x || maxCorner.x > maxPos.x || maxCorner.y < minPos.y || minCorner.y > maxPos.y))
  ) {
    viewPortPosition.x += ratio * shift / 2;
    const newCam = renderer.viewportToFramedGraph(viewPortPosition);
    newCam["ratio"] = camera.ratio * ratio;
    camera.animate(
      newCam,
      {duration: 300},
      hideLoader
    );
  } else hideLoader();
}


/* -- Graph interactions -- */

function clickNode(node, updateURL = true, center = false) {
  logDebug("CLICK NODE", {selectedNode, selectedNodeType, selectedNodeLabel, node, updateURL, center, comicsBarView, selectedComic});
  let data = networks[entity][networkSize];
  if (!data.graph || !renderer) return;

  // Unhiglight previous node
  const sameNode = (node === selectedNode);
  if (selectedNode) {
    if (data.graph.hasNode(selectedNode))
      data.graph.setNodeAttribute(selectedNode, "highlighted", false)
  }
  stopPlayComics();

  if (!node || !sameNode) {
    nodeImg.src = "";
    modalImg.src = "";
  }
  // Reset unselected node view
  renderer.setSetting("nodeReducer", (n, attrs) => (view === "pictures" ? { ...attrs, type: "image" } : attrs));
  renderer.setSetting("edgeReducer", (edge, attrs) => attrs);
  renderer.setSetting("labelColor", view === "pictures" ? {attribute: 'hlcolor'} : {color: '#999'});
  if (!node) {
    selectedNode = null;
    selectedNodeType = null;
    selectedNodeLabel = null;
    nodeLabel.style.display = "none";
    resize(true);
    if (updateURL)
      setURL(entity, networkSize, view, null, null, selectedComic, sortComics);
    selectSuggestions.selectedIndex = 0;
    defaultSidebar();
    if (comicsBarView && !sameNode)
      displayComics(null, true);
    return;
  }

  let relatedNodes = null,
    comicsRatio = 0,
    nodeEntity = entity;
  if (selectedNodeType && selectedNodeType !== entity) {
    if (data.graph.hasNode(node))
      selectedNodeType = entity;
    else {
      nodeEntity = selectedNodeType;
      data = networks[selectedNodeType].most;
      relatedNodes = crossMap[entity][node] || {};
      comicsRatio = allComics.length / (3 * (Object.values(relatedNodes).reduce((sum: number, cur: number) => sum + cur, 0) as number));
      logDebug("KEEP NODE", {selectedNode, selectedNodeType, selectedNodeLabel, node, nodeEntity, relatedNodes, comicsRatio});
    }
  }

  if (!data.graph.hasNode(node))
    return setURL(entity, networkSize, view, null, null, selectedComic, sortComics);

  if (updateURL && !sameNode)
    setURL(entity, networkSize, view, data.graph.getNodeAttribute(node, "label"), entity, selectedComic, sortComics);

  // Fill sidebar with selected node's details
  const attrs = data.graph.getNodeAttributes(node);
  selectedNode = node;
  selectedNodeLabel = attrs.label;
  nodeLabel.style.display = "inline";
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
  }
  resize(true);
  nodeExtra.innerHTML = "";
  if (attrs.description)
    nodeExtra.innerHTML += "<p>" + attrs.description + "</p>";
  nodeExtra.innerHTML += "<p>" +
    (nodeEntity === "creators" ? "Credit" : "Account") + "ed " +
      "in <b>" + attrs.stories + " stories</b> " +
    (entity === nodeEntity
      ? "shared&nbsp;with<br/>" +
        "<b>" + data.graph.degree(node) + " other " + nodeEntity + "</b>"
      : (entity === "creators" ? "authored&nbsp;by<br/>" : "featuring<br/>") +
        "<b>" + Object.keys(relatedNodes).length + " " + entity + "</b>"
    ) + "</p>";

  if (entity === nodeEntity) {
    // Display roles in stories for creators
    if (entity === "creators") {
      if (attrs.writer === 0 && attrs.artist)
        nodeExtra.innerHTML += '<p>Always as <b style="color: ' + lightenColor(creatorsRoles.artist) + '">artist (' + attrs.artist + ')</b></p>';
      else if (attrs.artist === 0 && attrs.writer)
        nodeExtra.innerHTML += '<p>Always as <b style="color: ' + lightenColor(creatorsRoles.writer) + '">writer (' + attrs.writer + ')</b></p>';
      else nodeExtra.innerHTML += '<p>Including <b style="color: ' + lightenColor(creatorsRoles.writer) + '">' + attrs.writer + ' as writer</b><br/>and <b style="color: ' + lightenColor(creatorsRoles.artist) + '">' + attrs.artist + " as artist</b></p>";
    }
    // Or communities if we have it for characters
    else if (data.communities[attrs.community])
      nodeExtra.innerHTML += '<p>Attached to the <b style="color: ' + data.communities[attrs.community].color + '">' + data.communities[attrs.community].label + '</b> <i>family</i></p>';
  } else
    nodeExtra.innerHTML += '<p>The size of the node reflects how often ' +
      'the ' + entity + ' are ' +
      (nodeEntity === "creators"
        ? "featured in stories authored by"
        : "credited in stories featuring"
      ) + " " + selectedNodeLabel +
       " within Marvel API's data.</p>";
  if (attrs.url)
    nodeExtra.innerHTML += '<p><a href="' + attrs.url + '" target="_blank">More on Marvel.com…</a></p>';
  if (comicsReady)
    setViewComicsButton(node);

    const comicEntities = selectedComic && selectedComic[selectedNodeType || entity];
  if (!comicsBarView || !(selectedComic && comicEntities && comicEntities.indexOf(node) !== -1)) {
    renderer.setSetting("labelGridCellSize", sigmaSettings.labelGridCellSize);
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
                size: sigmaDim < 500 ? 1 : 2,
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
                size: Math.max(2, Math.log(data.graph.getEdgeAttribute(edge, 'weight')) * sigmaDim / 5000)
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
        "nodeReducer", (n, attrs) => relatedNodes[n] !== undefined
          ? { ...attrs,
              type: view === "pictures" ? "image" : "circle",
              size: computeNodeSize(relatedNodes[n] * comicsRatio),
              zIndex: 2
            }
          : { ...attrs,
              type: "circle",
              zIndex: 0,
              color: "#2A2A2A",
              size: sigmaDim < 500 ? 1 : 2,
              label: null
            }
      );
      renderer.setSetting(
        "edgeReducer", (edge, attrs) =>
          relatedNodes[networks[entity][networkSize].graph.source(edge)] !== undefined &&
          relatedNodes[networks[entity][networkSize].graph.target(edge)] !== undefined
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

  if (comicsBarView) {
    if (!sameNode)
      displayComics(node, true);
    else if (selectedComic)
      selectComic(selectedComic, true, true);
  }
  if (!(comicsBarView && selectedComic) && (!updateURL || center)) {
    if (relatedNodes)
      centerNode(null, Object.keys(relatedNodes));
    else centerNode(node);
  } else hideLoader();

  if (!sameNode)
    comicsDiv.scrollTo(0, 0);
};

function getNodeComics(node) {
  const comicsList = node === null
    ? allComics
    : charactersComics[node] || creatorsComics[node] || [];
  if (hasClass(filterComics, "selected") && filterInput.value)
    return comicsList.filter(
      c => c.title.toLowerCase().indexOf(filterInput.value.toLowerCase()) !== -1
    );
  return comicsList;
  //.filter(c => (entity === "characters" && c.characters.length) || (entity === "creators" && c.creators.length));
}

function displayComics(node = null, autoReselect = false, resetTitle = true) {
  logDebug("DISPLAY COMICS", {selectedNode, node, autoReselect, resetTitle, selectedComic, selectedNodeLabel, sortComics, filter: filterInput.value});

  if (comicsBarView && node === selectedNode && !autoReselect && !resetTitle)
    return selectedComic ? scrollComicsList() : null;

  if (selectedNodeLabel && selectedNodeType && !selectedNode)
    clickNode(node, false, false);

  if (!selectedComic)
    selectedComic = "";

  comicsBarView = true;
  comicsBar.style.transform = "scaleX(1)";
  hideViewComicsButton();
  comicsCache.style.display = "none";

  if (resetTitle) {
    comicsTitle.innerHTML = "... comics";
    if (selectedNodeLabel)
      comicsTitle.innerHTML += "&nbsp;" + (selectedNodeType === "creators" ? "by" : "with") + " " + selectedNodeLabel.replace(/ /g, "&nbsp;");
    comicsSubtitleList.innerHTML = "";
  }
  comicsSubtitle.style.display = (selectedNode && creatorsComics[selectedNode] ? "inline" : "none");

  comicsList.innerHTML = "";
  if (!comicsReady) {
    loaderList.style.display = "block";
    const waiter = setInterval(() => {
     if (!comicsReady)
      return;
    clearInterval(waiter);
    return setTimeout(() => actuallyDisplayComics(node, autoReselect), 0);
    }, 50);
  } else actuallyDisplayComics(node, autoReselect);
}

function actuallyDisplayComics(node = null, autoReselect = false) {
  const graph = networks[entity][networkSize].graph,
    comics = getNodeComics(node)
      .sort(sortComics === "date" ? sortByDate : sortByTitle);

  if (!comics)
    comicsTitle.innerHTML = "";

  if ((selectedNode && creatorsComics[selectedNode]) || (!selectedNode && entity === "creators"))
    document.getElementById("clusters-layer").style.display = "none";

  if (comics && comics.length > 500)
    loaderList.style.display = "block";

  selectedComic = allComicsMap[selectedComic] || selectedComic;
  if (autoReselect) {
    const comicEntities = selectedComic && selectedComic[selectedNodeType || entity];
    if (selectedNode && comicEntities && comicEntities.indexOf(selectedNode) === -1)
      setURL(entity, networkSize, view, selectedNodeLabel, selectedNodeType, "", sortComics);
    else selectComic(allComicsMap[selectedComic] || selectedComic, true, autoReselect);
  }

  setTimeout(() => {
    renderHistogram(
      selectedNode ? nodeHistogram : fullHistogram,
      selectedNode,
      comics
    );

    comicsTitle.innerHTML = formatNumber(comics.length) + " comic" + (comics.length > 1 ? "s" : "");
    if (selectedNodeLabel) comicsTitle.innerHTML += "&nbsp;" + (selectedNodeType === "creators" ? "by" : "with") + " " + selectedNodeLabel.replace(/ /g, "&nbsp;");
    comicsSubtitle.style.display = (selectedNode && creatorsComics[selectedNode] ? "inline" : "none");

    if (selectedNodeLabel && creatorsComics[selectedNode])
      comicsSubtitleList.innerHTML = Object.keys(creatorsRoles)
        .map(x => '<span style="color: ' + lightenColor(creatorsRoles[x]) + '">' + x + '</span>')
        .join("&nbsp;")
        .replace(/&nbsp;([^&]+)$/, " or $1");

    setTimeout(() => {
      comicsList.innerHTML = comics.length
        ? comics.map(x => '<li id="comic-' + x.id + '"' + (selectedNodeLabel && creatorsComics[selectedNode] ? ' style="color: ' + lightenColor(creatorsRoles[x.role]) + '"' : "") + (selectedComic && x.id === selectedComic.id ? ' class="selected"' : "") + '>' + x.title + "</li>")
          .join("")
        : "<b>no comic-book found</b>";
      minComicLiHeight = 100;
      comics.forEach(c => {
        const comicLi = document.getElementById("comic-" + c.id) as any;
        minComicLiHeight = Math.min(minComicLiHeight, comicLi.getBoundingClientRect().height);
        comicLi.comic = c;
        comicLi.onmouseup = () => {
          preventAutoScroll = true;
          setURL(entity, networkSize, view, selectedNodeLabel, selectedNodeType, (selectedComic.id === comicLi.comic.id ? "" : comicLi.comic), sortComics);
        };
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

viewAllComicsButton.onclick = () => {
  addClass(viewAllComicsButton, "hidden");
  fullHistogram.style.display = "none";
  setURL(entity, networkSize, view, selectedNodeLabel, selectedNodeType, "", sortComics);
};
document.getElementById("close-bar").onclick =
  () => setURL(entity, networkSize, view, selectedNodeLabel, selectedNodeType);

function clearComicDetails() {
  comicTitle.innerHTML = "";
  comicImg.src = "";
  comicDesc.innerHTML = "";
  comicEntities.forEach(el => el.style.display = "none");
  comicCreators.innerHTML = "";
  comicCharacters.innerHTML = "";
  comicUrl.style.display = "none";
  renderer.setSetting("labelGridCellSize", sigmaSettings.labelGridCellSize);
}

function unselectComic() {
  logDebug("UNSELECT COMIC", {selectedComic, selectedNodeLabel});
  const graph = networks[entity][networkSize].graph;
  hoveredComic = null;
  selectComic("", true);
  clearComicDetails();
  document.querySelectorAll("#comics-list li.selected").forEach(
    el => rmClass(el, "selected")
  );
  if (selectedNode)
    clickNode(selectedNode, false, true);
  else clickNode(null, false);
}

function selectComic(comic, keep = false, autoReselect = false) {
  logDebug("SELECT COMIC", {selectedComic, comic, keep, autoReselect, selectedNodeLabel, selectedNodeType});

  const graph = networks[entity][networkSize].graph;
  if (!graph || !renderer) return;

  if (!autoReselect && (!comic || !hoveredComic || comic.id !== hoveredComic.id))
      clearComicDetails()

  if (keep) {
    selectedComic = comic;
    document.querySelectorAll("#comics-list li.selected").forEach(
      el => rmClass(el, "selected")
    );
    const comicLi = document.getElementById("comic-" + (comic ? comic.id : ""));
    if (comicLi) {
      addClass(comicLi, "selected");
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
        (x !== "-1" ? `class="entity-link tooltip" tooltip="explore the comics authored by '` + allCreators[x] + `'"` : '') +
        'title="writer" ' +
        'style="color: ' + lightenColor(creatorsRoles["writer"]) + '">' +
        allCreators[x] + "</li>"
      : ""
    ).join("");
  comicCreators.innerHTML += (comic.artists.length ? comic.artists : ["-1"])
    .map(x => allCreators[x]
      ? '<li id="creator-' + x + '" ' +
        (x !== "-1" ? `class="entity-link tooltip" tooltip="explore the comics authored by '` + allCreators[x] + `'"` : '') +
        'title="artist" ' +
        'style="color: ' + lightenColor(creatorsRoles["artist"]) + '">' +
        allCreators[x] + "</li>"
      : ""
    ).join("");
  comicCharacters.innerHTML = (comic.characters.length ? comic.characters : ["-1"])
    .map(x => allCharacters[x]
      ? '<li id="character-' + x + '" ' +
        (x !== "-1" ? `class="entity-link tooltip" tooltip="explore the comics featuring '` + allCharacters[x] + `'"` : '') + '>' +
        allCharacters[x] + "</li>"
      : ""
    ).join("");

  comic.creators.forEach(c => {
    if (!allCreators[c]) return;
    const entityLi = document.getElementById("creator-" + c) as HTMLElement;
    entityLi.onclick = () => setURL(entity, networkSize, view, allCreators[c], "creators", selectedComic, sortComics);
  });
  comic.characters.forEach(c => {
    if (!allCharacters[c]) return;
    const entityLi = document.getElementById("character-" + c) as HTMLElement;
    entityLi.onclick = () => setURL(entity, networkSize, view, allCharacters[c], "characters", selectedComic, sortComics);
  });
  (document.querySelectorAll(".entity-link") as NodeListOf<HTMLElement>).forEach(element => setupTooltip(element));

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
          size: sigmaDim < 500 ? 1 : 2,
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

  if (!preventAutoScroll && keep)
    scrollComicsList();
  preventAutoScroll = false;

  centerNode(null, comic[entity].filter(n => graph.hasNode(n)), false);
}

// Random node button
viewNodeButton.onclick = () => {
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
function disableSwitchButtons() {
  switchNodeType.disabled = true;
  switchNodeFilter.disabled = true;
  switchNodeView.disabled = true;
  (document.querySelectorAll('#view-node, #view-comics, #view-all-comics, #choices, .left, .right') as NodeListOf<HTMLElement>).forEach(
    el => addClass(el, "selected")
  );
}

function enableSwitchButtons() {
  switchNodeType.disabled = false;
  switchNodeFilter.disabled = false;
  switchNodeView.disabled = false;
  (document.querySelectorAll('#view-node, #view-comics, #view-all-comics, #choices, .left, .right') as NodeListOf<HTMLElement>).forEach(
    el => rmClass(el, "selected")
  );
}

switchNodeType.onchange = (event) => {
  disableSwitchButtons();
  const target = event.target as HTMLInputElement;
  explanations.style.opacity = "0";
  setURL(target.checked ? "creators" : "characters", networkSize, view, selectedNodeLabel, selectedNodeType, selectedComic, sortComics);
};

switchNodeFilter.onchange = (event) => {
  disableSwitchButtons();
  const target = event.target as HTMLInputElement;
  explanations.style.opacity = "0";
  setURL(entity, target.checked ? "most" : "main", view, selectedNodeLabel, selectedNodeType, selectedComic, sortComics);
};

switchNodeView.onchange = (event) => {
  disableSwitchButtons();
  const target = event.target as HTMLInputElement;
  setURL(entity, networkSize, target.checked ? "colors" : "pictures", selectedNodeLabel, selectedNodeType, selectedComic, sortComics);
};


/* -- Interface display -- */

(document.querySelectorAll(".reset-graph") as NodeListOf<HTMLElement>).forEach(el => {
  el.setAttribute("tooltip", "reset graph");
  addClass(el, "tooltip");
  el.onclick = () => {
    if (!renderer) return;
    hideComicsBar();
    setURL(entity, networkSize, view);
    setTimeout(() => camera.animate({x: 0.5, y: 0.5, ratio: 1, angle: 0}, {duration: 250}), 100);
  }
});

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
  if (comicsReady)
    renderHistogram(
      selectedNode ? nodeHistogram : fullHistogram,
      selectedNode
    );
}

function hideComicsBar() {
  if (hasClass(filterComics, "selected")) {
    rmClass(filterComics, "selected");
    filterComics.setAttribute("tooltip", "search comics")
    filterSearch.style.display = "none";
    renderHistogram(
      selectedNode ? nodeHistogram : fullHistogram,
      selectedNode
    );
  }
  comicsCache.style.display = "none";
  comicsBarView = false;
  comicsBar.style.transform = "scaleX(0)";
  modalNext.style.opacity = "0";
  modalPrev.style.opacity = "0";
  showViewComicsButton();
  rmClass(viewComicsButton, "hidden");
  rmClass(viewAllComicsButton, "hidden");
  unselectComic();
  selectedComic = null;
  if (entity === "creators" && clustersLayer)
    clustersLayer.style.display = "block";
}

function setViewComicsButton(node) {
  switchClass(viewComicsButton, "hidden", comicsBarView);
  viewComicsButton.onclick = () => {
    addClass(viewComicsButton, "hidden");
    nodeHistogram.style.display = "none";
    setURL(entity, networkSize, view, selectedNodeLabel, selectedNodeType, "", sortComics);
  };
  renderHistogram(nodeHistogram, node);
}

function showViewComicsButton() {
  switchClass(viewComicsButton, "hidden", !comicsReady || comicsBarView);
  switchClass(viewAllComicsButton, "hidden", !comicsReady || comicsBarView);
  if (!comicsBarView) {
    nodeHistogram.style.display = "block";
    fullHistogram.style.display = "block";
  }
  resize(true);
}

function hideViewComicsButton() {
  addClass(viewComicsButton, "hidden");
  addClass(viewAllComicsButton, "hidden");
  nodeHistogram.style.display = "none";
  fullHistogram.style.display = "none";
  resize(true);
}

// Help Box
let preventClick = false;
helpButton.onclick = () => {
  helpModal.style.display = "block";
  setTimeout(() => helpBox.style.transform = "scale(1)", 0);
}
helpModal.onclick = () => {
  if (preventClick) {
    preventClick = false;
    return;
  }
  preventClick = false;
  helpBox.style.transform = "scale(0)";
  setTimeout(() => helpModal.style.display = "none", 300);
}
helpBox.onclick = (e) => {
  preventClick = true;
}
document.getElementById("close-help").onclick = helpModal.onclick;

// Handle tooltips
function clearTooltip(e, tooltipId="tooltip") {
  const tooltip = document.getElementById(tooltipId) as HTMLElement;
  tooltip.innerHTML = "";
  tooltip.style.display = "none";
};

function setupTooltip(element) {
  element.onmouseenter = e => {
    if (isTouchDevice() && !e.touches) return;
    const tooltip = element.getAttribute("tooltip");
    if (!tooltip ||
      (hasClass(element, "reset-graph") && !(selectedNode || selectedComic)) ||
      ((element.attributes["type"] || {}).value === "search" && element === document.activeElement) ||
      (hasClass(element, "selected") && element.id.indexOf("comics") !== 0)
    ) return clearTooltip(e);
    globalTooltip.innerHTML = tooltip.replace(/'entity'/g, entity.replace(/s$/, ''))
      .replace(/'([^']+)'/g, (g0, g1) => '<span class="lightred">' + g1.replace(/ /g, '&nbsp;') + '</span>')
      .replace('in the graph', 'in&nbsp;the&nbsp;graph');
    globalTooltip.style.display = "block";
    const dims = globalTooltip.getBoundingClientRect(),
      clientX = e.touches ? e.touches[0].clientX : e.clientX,
      clientY = e.touches ? e.touches[0].clientY : e.clientY,
      pos = {
        x: e.touches && clientY < 100 ?
          clientX + (clientX > 250 ? -dims.width - 50 : 50) :
          clientX - dims.width / 2,
        y: clientY + (clientY < 100 ? (e.touches ? -dims.height / -dims.height / 2 : 25) : -dims.height - (e.touches ? 40 : 15))
      };
    globalTooltip.style.top = pos.y + "px";
    globalTooltip.style.left = Math.min(window.innerWidth - dims.width, Math.max(0, pos.x)) + "px";
  };
  element.onmousemove = element.onmouseenter;
  element.onmouseleave = clearTooltip;
  element.ontouchstart = element.onmouseenter;
}

(document.querySelectorAll(".tooltip") as NodeListOf<HTMLElement>).forEach(element => setupTooltip(element));
document.onclick = clearTooltip;
document.ontouchend = clearTooltip;


/* -- Comics bar interactions -- */

// Next/Previous/Play/Pause comics buttons handling
function scrollComicsList() {
  preventAutoScroll = false;
  setTimeout(() => {
    const offset = document.querySelector("#comics-list li.selected") as HTMLElement;
    if (!offset) return;
    const listHeight = divHeight("comics");
    let diff = listHeight < 5 * minComicLiHeight
      ? listHeight + minComicLiHeight
      : listHeight / 2 + minComicLiHeight;
    comicsDiv.scrollTo(0, offset.offsetTop - diff);
  }, 10);
}

function selectAndScroll(el) {
  if (!el) return;
  setURL(entity, networkSize, view, selectedNodeLabel, selectedNodeType, el.comic, sortComics);
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
  setURL(entity, networkSize, view, selectedNodeLabel, selectedNodeType, selectedComic, "alpha");
};

sortDate.onclick = () => {
  setURL(entity, networkSize, view, selectedNodeLabel, selectedNodeType, selectedComic, "date");
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
  if (hasClass(filterComics, "selected")) {
    rmClass(filterComics, "selected");
    filterComics.setAttribute("tooltip", "search comics");
    filterSearch.style.display = "none";
  } else {
    addClass(filterComics, "selected");
    filterComics.setAttribute("tooltip", "clear comics filter");
    filterSearch.style.display = "block";
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
        setURL(entity, networkSize, view, selectedNodeLabel, selectedNodeType, "", sortComics);
        break;

      default: return; // exit this handler for other keys
    }
  } else if (comicsBarView) {
    if (e.which === 37 || e.which === 38)
      selectAndScroll(document.querySelector("#comics-list li:last-child") as any);
    else if (e.which === 39 || e.which === 40)
      selectAndScroll(document.querySelector("#comics-list li:first-child") as any);
    else if (e.which === 27)
      setURL(entity, networkSize, view, selectedNodeLabel, selectedNodeType);
    else return;
  }  else if (selectedNode && e.which === 27)
    clickNode(null);
  else return;
  e.preventDefault(); // prevent the default action (scroll / move caret)
};


/* -- Swipe touch handling -- */

let touches = {x: [0, 0], y: [0, 0]};

function touchStart(e) {
  touches.x[0] = e.changedTouches[0].screenX;
  touches.y[0] = e.changedTouches[0].screenY;
};
function addTouchStart(el) {
  const existing = el.ontouchstart;
  el.ontouchstart(e => {
    existing && existing(e);
    touchStart(e);
  });
}
modal.ontouchstart = touchStart;
comicImg.ontouchstart = touchStart;
addTouchStart(switchTypeLabel);
addTouchStart(switchViewLabel);
addTouchStart(switchFilterLabel);

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
    setURL(switchNodeType.checked ? "creators" : "characters", networkSize, view, selectedNodeLabel, selectedNodeType, selectedComic, sortComics);
  }
};

switchFilterLabel.ontouchend = e => {
  const typ = touchEnd(e, 20);
  if (typ === "left" || typ === "right") {
    switchNodeFilter.checked = !switchNodeFilter.checked;
    setURL(entity, switchNodeFilter.checked ? "most" : "main", view, selectedNodeLabel, selectedNodeType, selectedComic, sortComics);
  }
};

switchViewLabel.ontouchend = e => {
  const typ = touchEnd(e, 0);
  if (typ === "left" || typ === "right") {
    switchNodeView.checked = !switchNodeView.checked;
    setURL(entity, networkSize, switchNodeView.checked ? "colors" : "pictures", selectedNodeLabel, selectedNodeType, selectedComic, sortComics);
  }
};


/* -- Comics histogram timeline -- */

function buildLegendItem(year, ref = "") {
  let className = '',
    color = '';
  if (ref !== "start" && year !== startYear && year !== curYear && year !== 1980)
    className = ' class="hidable"';
  if (ref === "start")
    color = '; color: var(--marvel-red-light)';
  else if (ref === "old")
    color = '; color: #555';
  return '<div style="left: calc((100% - 25px) * ' + Math.round(1000 * (year - startYear) / totalYears) / 1000 + ')' +
    color + '"' + className + '>' + year + '</div>';
}

function buildHistogram(node, comics) {
  if (histograms[entity][node] && !comics)
    return histograms[entity][node];
  const histo = {
    values: new Array(totalYears).fill(0),
    start: curYear,
    end: startYear,
    sum: 0
  };
  (comics || getNodeComics(node)).forEach(c => {
    const comicYear = (new Date(c.date)).getFullYear();
    histo.values[comicYear - startYear] += 1;
    histo.start = Math.min(histo.start, comicYear);
    histo.end = Math.max(histo.end, comicYear);
    histo.sum += 1
  });
  if (!comics)
    histograms[entity][node] = histo;
  return histo;
}

function renderHistogram(element, node = null, comics = null) {
  const histogram = buildHistogram(node, comics);

  const maxWidth = divWidth(comicsBarView ? "comics-bar" : "sidebar"),
    heightRatio = 25 / Math.max.apply(Math, histogram.values),
    barWidth = Math.round(1000 * maxWidth / totalYears) / 1000;

  fullHistogram.innerHTML = "";
  nodeHistogram.innerHTML = "";
  comicsHistogram.innerHTML = "";
  let histogramDiv = '';
  if (!comicsBarView)
    histogramDiv += '<div id="histogram-title">' + formatNumber(histogram.sum) + " comics between " + histogram.start + "&nbsp;&amp;&nbsp;" + histogram.end + '</div>';

  histogramDiv += '<div id="histogram">';
  histogram.values.forEach((y, idx) => histogramDiv +=
    '<span class="histobar" ' +
      'style="width: calc(100% / ' + totalYears + '); ' +
        'height: ' + Math.round(y * heightRatio) + 'px">' +
    '</span>'
  );

  histogramDiv += '</div><div id="histogram-hover">';
  histogram.values.forEach((y, idx) => histogramDiv +=
    '<span class="histobar-hover" tooltip="' +
      (y ? y + '&nbsp;comic' + (y > 1 ? 's' : '') + '&nbsp;in&nbsp;' : '') + (startYear + idx) + '" ' +
      'style="width: calc(100% / ' + totalYears + ')">' +
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
      histogramDiv += buildLegendItem(histogram.start,
        node === null && (!comics || comics.length === allComics.length)? "" : "start");
  });
  histogramDiv += '</div><div id="histogram-tooltip">';
  (comicsBarView ? comicsHistogram : element).innerHTML = histogramDiv;

  const histoTooltip = document.getElementById("histogram-tooltip") as HTMLElement;
  (document.querySelectorAll(".histobar-hover") as NodeListOf<HTMLElement>).forEach(bar => {
    bar.onmouseenter = e => {
      const tooltip = bar.getAttribute("tooltip");
      if (!tooltip)
        return clearTooltip(e, "histogram-tooltip");
      histoTooltip.innerHTML = tooltip;
      histoTooltip.style.display = "inline-block";
      const dims = bar.getBoundingClientRect(),
        tooltipWidth = divWidth("histogram-tooltip"),
        leftPos = (comicsBarView ? comicsHistogram : element).getBoundingClientRect().x,
        maxWidth = divWidth(comicsBarView ? "comics-bar" : "sidebar");
      histoTooltip.style.top = (dims.bottom + (comicsBarView ? -1 : 2)) + "px";
      histoTooltip.style.left = Math.min(maxWidth - tooltipWidth - 3, Math.max(3, dims.x - leftPos - tooltipWidth / 2)) + "px";
    };
    bar.ontouchstart = e => {
      e.preventDefault();
      document.querySelectorAll(".histobar-hover.highlighted").forEach(b => rmClass(b, "highlighted"));
      const touch = e.touches[0];
      if (!touch) return;
      const x = touch.clientX,
        y = touch.clientY;
      (document.querySelectorAll(".histobar-hover") as NodeListOf<HTMLElement>).forEach(b => {
        const bDims = b.getBoundingClientRect();
        if (
          x >= bDims.left && x <= bDims.right &&
          y >= bDims.top  && y <= bDims.bottom
        ) {
          addClass(b, "highlighted");
          b.onmouseenter(e as any);
        }
      });
    };
    bar.ontouchmove = bar.ontouchstart;
  });
  document.getElementById("histogram-hover").onmouseleave = e => clearTooltip(e, "histogram-tooltip");
  sideBar.ontouchstart = e => clearTooltip(e, "histogram-tooltip");
}


/* -- Responsiveness handling -- */

let resizing = null;

function resize(fast = false) {
  logDebug("RESIZE");
  if (!fast) resizing = true;
  const graph = entity ? networks[entity][networkSize].graph : null,
    freeHeight = (divHeight("sidebar") - divHeight("header") - divHeight("choices") - divHeight("credits") - 1) + "px";
  explanations.style.opacity = "1"
  explanations.style.height = freeHeight;
  explanations.style["min-height"] = freeHeight;
  nodeDetails.style.height = freeHeight;
  nodeDetails.style["min-height"] = freeHeight;
  comicsDiv.style.height = divHeight("comics-bar") - divHeight("comics-header") - divHeight("comic-details") - 11 + "px";
  loader.style.transform = (comicsBarView && comicsBar.getBoundingClientRect().x !== 0 ? "translateX(-" + divWidth("comics-bar") / 2 + "px)" : "");
  const comicsDims = comicsDiv.getBoundingClientRect();
  ["width", "height", "top"].forEach(k =>
    comicsCache.style[k] = comicsDims[k] + "px"
  );
  const sigmaDims = container.getBoundingClientRect();
  sigmaDim = Math.min(sigmaDims.height, sigmaDims.width);
  updateShift();
  if (!fast && renderer) {
    const ratio = Math.pow(1.1, Math.log(camera.ratio) / Math.log(1.5));
    renderer.setSetting("labelRenderedSizeThreshold", ((networkSize === "main" ? 6 : 4) + (entity === "characters" ? 1 : 0.5)) * sigmaDim / 1000);
    graph.forEachNode((node, {stories}) =>
      graph.setNodeAttribute(node, "size", computeNodeSize(stories))
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

function setURL(ent, siz, vie, sel = null, selType = null, comics = null, sort = "date") {
  const opts = [];
  if (sel !== null && !(ent === selType && !(networks[ent][siz].graph && networks[ent][siz].graph.findNode((node, {label}) => label === sel))))
    opts.push((selType || ent).replace(/s$/, "") + "=" + sel.replace(/ /g, "+"));
  if (comics !== null) {
    opts.push("comics" + (comics ? "=" + comics.id : ""));
    if (sort === "alpha")
      opts.push("sort=" + sort);
  }

  window.location.hash = "/" + siz + "/" + ent + "/" + vie + "/"
    + (opts.length ? "?" + opts.join("&") : "");
}

function readURL() {
  const args = window.location.hash
    .replace(/^#\//, '')
    .split(/\/\??/);
  if (args.length < 4
    || ["main", "most"].indexOf(args[0]) === -1
    || ["characters", "creators"].indexOf(args[1]) === -1
    || ["pictures", "colors"].indexOf(args[2]) === -1
  ) return setURL("characters", "main", "pictures");
  const opts = Object.fromEntries(
    args[3].split("&")
    .map(o => /=/.test(o) ? o.split("=") : [o, ""])
    .filter(o => ["creator", "character", "comics", "sort"].indexOf(o[0]) !== -1)
  );

  const reload = args[1] !== entity || args[0] !== networkSize,
    switchv = args[2] !== view;

  const oldNodeLabel = selectedNodeLabel;
  selectedNodeLabel = null;
  searchInput.value = "";
  ["character", "creator"].forEach(e => {
    if (opts[e]) {
      selectedNodeType = e + "s";
      selectedNodeLabel = decodeURIComponent(opts[e].replace(/\+/g, " "));
      searchInput.value = selectedNodeLabel;
    }
  });
  const clickn = selectedNodeLabel !== oldNodeLabel;

  const oldComic = selectedComic,
    oldSort = sortComics,
    shouldComicsBarView = opts["comics"] !== undefined;
  selectedComic = shouldComicsBarView ? allComicsMap[opts["comics"]] || opts["comics"] || "" : null;
  sortComics = opts["sort"] || "date";
  switchClass(sortDate, "selected", sortComics === "date");
  switchClass(sortAlpha, "selected", sortComics === "alpha");

  const dispc = selectedComic !== oldComic || sortComics !== oldSort;

  logDebug("READ URL", {args, opts, reload, switchv, clickn, oldNodeLabel, selectedNodeLabel, dispc, oldComic, selectedComic, shouldComicsBarView, oldSort, sortComics});

  // Update titles
  const combo = args[0] + " " + args[1];
  let title = "Marvel's " + combo + " " + (args[1] === "creators" ? "credited" : "featured") + " together within same&nbsp;comics";
  if (selectedNodeLabel)
    title += " " + (selectedNodeType === args[1]
      ? "as"
      : (selectedNodeType === "creators"
        ? "from"
        : "casting")) + " ";
  document.querySelector("title").innerHTML = "MARVEL graphs &mdash; Map of " + title + (selectedNodeLabel ? selectedNodeLabel : "");
  document.getElementById("title").innerHTML = title.replace(combo, '<span class="red">' + combo + '</span>');
  nodeLabel.style.display = (selectedNodeLabel ? "inline" : "none");
  nodeLabel.innerHTML = selectedNodeLabel;
  resize(true);

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
        role.style.color = lightenColor(creatorsRoles[k]);
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
  charactersDetailsSpans.forEach(span => span.style.display = (entity === "characters" ? "inline" : "none"));
  creatorsDetailsSpans.forEach(span => span.style.display = (entity === "creators" ? "inline" : "none"));
  document.getElementById("min-stories").innerHTML = conf["min_stories_for_" + entity];
  document.getElementById("cooccurrence-threshold").innerHTML = conf["cooccurrence_threshold_for_" + entity];

  // Setup View switch
  switchNodeView.checked = args[2] === "colors";
  view = args[2];
  colorsDetailsSpans.forEach(span => span.style.display = (view === "colors" ? "inline" : "none"));
  picturesDetailsSpans.forEach(span => span.style.display = (view === "pictures" ? "inline" : "none"));

  // Update tooltips
  viewComicsButton.setAttribute("tooltip",
    "browse the list of comics listed as " +
    (selectedNodeLabel === "creators" ? "authored by" : "featuring") +
    " '" + selectedNodeLabel + "'"
  );
  searchInput.setAttribute("tooltip", (selectedNodeLabel
    ? "change focused 'entity'"
    : "search a specific 'entity' in the graph")
  );
  switchFilterLabel.setAttribute("tooltip", "switch to the '" +
    (networkSize === "main" ? "complete" : "reduced") +
    "' version of the network with " +
    (networkSize === "main" ? "'most" : "only the 'main") +
    " " + entity + "'"
  );
  switchTypeLabel.setAttribute("tooltip", "switch to the network of '" +
    (entity === "creators" ? "characters" : "creators") + "'" +
    (!selectedNodeLabel ? "" : " " +
      (entity === "creators" ? "featured" : "credited") +
      " in comics " +
      (selectedNodeType === "creators" ? "from" : "with") +
      " '" + selectedNodeLabel + "'")
  );
  switchViewLabel.setAttribute("tooltip", "switch the " + entity + " aspect to '" +
    (view === "colors" ? "avatar images" :
      (entity === "creators" ? "vocation" : "community") + " colors"
    ) + "'"
  );
  if (sortComics === "date") {
    sortDate.setAttribute("tooltip", "comics are ordered by 'publication date'");
    sortAlpha.setAttribute("tooltip", "sort comics by 'title &amp; issue number'");
  } else {
    sortDate.setAttribute("tooltip", "sort comics by 'publication date'");
    sortAlpha.setAttribute("tooltip", "comics are ordered by 'title and issue number'");
  }

  const graph = networks[entity][networkSize].graph;
  if (reload) setTimeout(() => {
    // If graph already loaded, just render it
    stopPlayComics();
    if (graph)
      renderNetwork(shouldComicsBarView);
    // Otherwise load network file
    else loadNetwork(entity, networkSize, () => renderNetwork(shouldComicsBarView));
  }, 0);
  else if (switchv) {
    if (graph && renderer) {
      loader.style.display = "block";
      loader.style.opacity = "0.5";

      setTimeout(() => {
        renderer.setSetting("nodeReducer", (n, attrs) => (view === "pictures" ? { ...attrs, type: "image" } : attrs));
        renderer.setSetting("edgeReducer", (edge, attrs) => attrs);
        renderer.setSetting("labelColor", view === "pictures" ? {attribute: 'hlcolor'} : {color: '#999'});
        if (graph && shouldComicsBarView && selectedComic)
          selectComic(selectedComic, true, true);
        else if (graph && selectedNode)
          clickNode(selectedNode, false);
        else hideLoader();
        enableSwitchButtons();
      }, 10);
    }
  } else if (clickn) {
    stopPlayComics();
    let network = networks[entity][networkSize];
    if (selectedNodeType !== entity) {
      loadNetwork(selectedNodeType, "most", () => {
        clickNode(networks[selectedNodeType].most.graph.findNode((n, {label}) => label === selectedNodeLabel), false);
      }, true);
    } else clickNode(graph.findNode((n, {label}) =>label === selectedNodeLabel), false);
  } else if (dispc) {
    if (!shouldComicsBarView)
      hideComicsBar();
    else if (!comicsBarView || oldSort !== sortComics)
      displayComics(selectedNode, true, oldSort === sortComics);
    else if (selectedComic)
      selectComic(selectedComic, true);
    else unselectComic();
    hideLoader();
  }
}


/* -- Init app -- */

// Collect algo's metadata to feed explanations
disableSwitchButtons();
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
