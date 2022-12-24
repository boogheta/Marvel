/* TODO:
- mobiles fixes:
  - reduce histogram height on small ?
- left todo with full histo:
  - adjust time legends choices (all decades ?)
  - add play timeline button
  - clickable/selectable years url bound?
- homogeneize nodes sizes on time hover with small selection
- fix switch entity on unselected node does not recenter graph / recenter not applied on reloading on comics
- add star on family that focuses sentence in help
- check bad data marvel :
  - http://gateway.marvel.com/v1/public/stories/186542/creators incoherent with https://www.marvel.com/comics/issue/84372/damage_control_2022_1
  - check why Tiomothy Truman has no comic
  - filter creator "Title"
  - merge Curt Conners => Lizard
  - check gweenpool & jeff missing
  - http://localhost:3000/#/creators/?creator=Gail+Simone&comics=73419 should have Braga not Pacheco
  - check why zoom on Spiderman 1602 only zooms on regular spiderman
  - test new spatialization graphology
  - test FA2 + louvain after sparsification
 => scraper comics as counter-truth? :
  - select good creators fields
  - take from scraping good image url if /clean within (example https://www.marvel.com/comics/issue/51567/captain_britain_and_the_mighty_defenders_2015_1)
  - handle or drop missing dates?
  - rebuild characters network from comics instead of stories, ex: Silk
  - rebuild creators network from cleaned comics instead
  - filter imprint marvel
  - add cover artist in comics list, not in links used
 => one more check with takoyaki on authors/characters labels + readjust louvain after
- update screenshots + make gif
- update README
- auto data updates
- reorga dossiers
IDEAS:
- add more cases to legend
- build gif of all versions of the app
- improve touch tooltips :
  - touchmove should follow across tooltips like histogram's
  - better positioning away from the finger
- add urlrooting for modal? and play?
- install app button?
- swipe images with actual slide effect?
- handle old browsers where nodeImages are full black (ex: old iPad)
- handle alternate phone browsers where sigma does not work, ex Samsung Internet on Android 8
- test bipartite network between authors and characters filtered by category of author
- build data on movies and add a switch?
*/

import Papa from "papaparse";
import Graph from "graphology";
import { Sigma } from "sigma";
import { Coordinates } from "sigma/types";
import {
  logDebug,
  hasClass, addClass, rmClass, switchClass,
  fixImage,
  formatNumber, formatMonth,
  lightenColor,
  meanArray,
  divWidth, divHeight,
  isTouchDevice, webGLSupport,
  rotatePosition,
  uncompress,
  buildComicsList
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
  selectedNode = null,
  selectedNodeType = null,
  selectedNodeLabel = null,
  sigmaDim = null,
  renderer = null,
  camera = null,
  currentReducers = {nodes: null, edges: null},
  animation = null,
  clustersLayer = null,
  resizeClusterLabels = function() {},
  histograms = {
    characters: {},
    creators: {}
  },
  suggestions = [],
  allSuggestions = [],
  comicsReady = null,
  comicsBarView = false,
  shift = 0,
  preventAutoScroll = false,
  minComicLiHeight = 100,
  hoveredComic = null,
  selectedComic = null,
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
  networks[e] = {
    communities: {},
    counts: {},
    clusters: {}
  }
  for (let cl in clusters[e]) {
    networks[e].clusters[cl] = {};
    for (let at in clusters[e][cl])
      networks[e].clusters[cl][at] = clusters[e][cl][at];
  }
});

// Useful DOM elements
const container = document.getElementById("sigma-container") as HTMLElement,
  legendDiv = document.getElementById("legend") as HTMLElement,
  controls = document.getElementById("controls") as HTMLElement,
  loader = document.getElementById("loader") as HTMLElement,
  loaderComics = document.getElementById("loader-comics") as HTMLElement,
  loaderList = document.getElementById("loader-list") as HTMLElement,
  helpButton = document.getElementById("help") as HTMLElement,
  helpModal = document.getElementById("help-modal") as HTMLElement,
  helpBox = document.getElementById("help-box") as HTMLElement,
  modal = document.getElementById("modal") as HTMLElement,
  modalImg = document.getElementById("modal-img") as HTMLImageElement,
  modalImgMissing = document.getElementById("modal-img-missing") as HTMLImageElement,
  modalNext = document.getElementById("modal-next") as HTMLButtonElement,
  modalPrev = document.getElementById("modal-previous") as HTMLButtonElement,
  modalPlay = document.getElementById("modal-play") as HTMLButtonElement,
  modalPause = document.getElementById("modal-pause") as HTMLButtonElement,
  comicsActions = document.getElementById("comics-actions") as HTMLButtonElement,
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
  orderSpan = document.getElementById("order") as HTMLElement,
  nodeDetails = document.getElementById("node-details") as HTMLElement,
  nodeLabel = document.getElementById("node-label") as HTMLElement,
  nodeImg = document.getElementById("node-img") as HTMLImageElement,
  nodeExtra = document.getElementById("node-extra") as HTMLElement,
  histogramContainer = document.getElementById("histogram-container") as HTMLElement,
  histogramTitle = document.getElementById("histogram-title") as HTMLElement,
  histogramDiv = document.getElementById("histogram") as HTMLElement,
  histogramHover = document.getElementById("histogram-hover") as HTMLElement,
  histogramLegend = document.getElementById("histogram-legend") as HTMLElement,
  histoTooltip = document.getElementById("histogram-tooltip") as HTMLElement,
  comicsBar = document.getElementById("comics-bar") as HTMLImageElement,
  comicsDiv = document.getElementById("comics") as HTMLImageElement,
  comicsTitle = document.getElementById("comics-title") as HTMLElement,
  comicsSubtitle = document.getElementById("comics-subtitle") as HTMLElement,
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
  searchIcon = document.getElementById("search-icon") as HTMLInputElement,
  searchSuggestions = document.getElementById("suggestions") as HTMLDataListElement,
  selectSuggestions = document.getElementById("suggestions-select") as HTMLSelectElement,
  switchNodeType = document.getElementById("node-type-switch") as HTMLInputElement,
  switchTypeLabel = document.getElementById("switch-type") as HTMLInputElement,
  globalTooltip = document.getElementById("tooltip") as HTMLElement,
  entitySpans = document.querySelectorAll(".entity") as NodeListOf<HTMLElement>,
  charactersDetailsSpans = document.querySelectorAll(".characters-details") as NodeListOf<HTMLElement>,
  creatorsDetailsSpans = document.querySelectorAll(".creators-details") as NodeListOf<HTMLElement>;


/* -- Load & prepare data -- */

function loadNetwork(ent, callback = null, waitForComics = false) {
  if (networks[ent].loaded && (!waitForComics || comicsReady))
    return callback ? setTimeout(callback, 0) : null;

  if (callback || (waitForComics && !comicsReady))
    showLoader();

  if (networks[ent].loading) {
    if (callback) {
      const waiter = setInterval(() => {
        if (!networks[ent].loaded || (waitForComics && !comicsReady))
          return;
        clearInterval(waiter);
        return setTimeout(callback, 0);
      }, 50);
    }
    return;
  }

  logDebug("LOAD NETWORK", {ent});
  networks[ent].loading = true;
  return fetch("./data/Marvel_" + ent + "_by_stories_full" + ".json.gz")
    .then(res => res.arrayBuffer())
    .then(content => buildNetwork(content, ent, callback, waitForComics));
}

function computeNodeSize(count) {
  return (2/3 + Math.pow(count, 0.2)
    * (entity === "characters" ? 1.75 : 1.25)
    * 1.25) * sigmaDim / 1000;
};

function buildNetwork(networkData, ent, callback, waitForComics) {
  logDebug("BUILD GRAPH", {ent});
  const data = networks[ent];
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

    // Adjust nodes visual attributes for rendering (size, color)
    data.graph.forEachNode((node, {label, stories, image, artist, writer, community}) => {
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
      const size = computeNodeSize(stories);
      data.graph.mergeNodeAttributes(node, {
        name: label,
        label: null,
        type: "circle",
        image: /available/i.test(image) ? "" : image,
        size: size,
        color: lightenColor(color, 25),
        borderColor: lightenColor(color, 25),
        borderSize: sigmaDim / 1500,
        haloSize: size * 5,
        haloIntensity: 0.05 * Math.log(stories),
        haloColor: lightenColor(color, 75)
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
    networks[ent].loaded = true;
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
      loaderComics.style.display = "none";
      rmClass(viewComicsButton, "selected");
      renderHistogram(selectedNode);
      resize(true);
      ["creators", "characters"].forEach(
        e => loadNetwork(e)
      );
    }
  });
}


/* -- Graphs display -- */

function renderNetwork(shouldComicsBarView) {
  logDebug("RENDER", {entity, selectedNode, selectedNodeType, selectedNodeLabel, shouldComicsBarView, comicsBarView, selectedComic});
  const data = networks[entity];

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
      '<b style="color: ' + lightenColor(data.clusters[k].color, 25) + '">'
      + k.split(" ").map(x => '<span>' + x + '</span>').join(" ")
      + ' (<span class="color">' + formatNumber(data.counts[data.clusters[k].community]) + '</span>)</b>'
    ).join(", ");

  // Instantiate sigma:
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
        setURL(entity, selectedNodeLabel, selectedNodeType, "", sortComics);
      else if (comicsBarView)
        setURL(entity, selectedNodeLabel, selectedNodeType);
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

    renderer.setGraph(data.graph);
  }
  renderer.setSetting("minCameraRatio", entity === "creators" ? 0.035 : 0.07);

  // Render clusters labels layer on top of sigma for creators
  if (entity === "creators") {
    let clusterLabelsDoms = "";
    for (const cluster in data.clusters) {
      const c = data.clusters[cluster];
      // adapt the position to viewport coordinates
      const viewportPos = renderer.graphToViewport(c as Coordinates);
      clusterLabelsDoms += '<div id="community-' + c.id + '" class="cluster-label" style="top: ' + viewportPos.y + 'px; left: ' + viewportPos.x + 'px; color: ' + c.color + '">' + c.label + '</div>';
    }
    clustersLayer.innerHTML = clusterLabelsDoms;

    resizeClusterLabels = () => {
      const sigmaDims = container.getBoundingClientRect();
      clustersLayer.style.width = sigmaDims.width + "px";

      for (const cluster in data.clusters) {
        const c = data.clusters[cluster];
        const clusterLabel = document.getElementById("community-" + c.id);
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
  allSuggestions = data.graph.nodes()
    .map((node) => ({
      node: node,
      label: data.graph.getNodeAttribute(node, "name")
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
    renderer.setSetting("nodeReducer", (n, attrs) => attrs);
    // If a node is selected we refocus it
    if (selectedNodeLabel && selectedNodeType !== entity)
      return loadNetwork(selectedNodeType, () => {
        showCanvases();
        clickNode(networks[selectedNodeType].graph.findNode((n, {label}) => label === selectedNodeLabel), false, true);
        conditionalOpenComicsBar();
      }, true);
    const node = selectedNodeLabel
      ? data.graph.findNode((n, {label}) => label === selectedNodeLabel)
      : null;
    showCanvases();
    clickNode(node, false, true);
    conditionalOpenComicsBar();
  }

  resize();
  showLoader();
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
        data.graph.updateEachNodeAttributes((node, attrs) => ({
          ...attrs,
          type: "image",
          label: attrs.name
        }), {attributes: ['type', 'label']});
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

searchIcon.onclick = () => searchInput.focus();

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
  const data = networks[entity];
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
  let data = networks[entity];
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
    modalImgMissing.style.display = "none";
  }
  // Reset unselected node view
  renderer.setSetting("nodeReducer", (n, attrs) => attrs);
  renderer.setSetting("edgeReducer", (edge, attrs) => attrs);
  if (!node) {
    selectedNode = null;
    selectedNodeType = null;
    selectedNodeLabel = null;
    nodeLabel.style.display = "none";
    resize(true);
    if (updateURL)
      setURL(entity, null, null, selectedComic, sortComics);
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
      data = networks[selectedNodeType];
      relatedNodes = crossMap[entity][node] || {};
      comicsRatio = allComics.length / (3 * (Object.values(relatedNodes).reduce((sum: number, cur: number) => sum + cur, 0) as number));
      logDebug("KEEP NODE", {selectedNode, selectedNodeType, selectedNodeLabel, node, nodeEntity, relatedNodes, comicsRatio});
    }
  }

  if (!data.graph.hasNode(node))
    return setURL(entity, null, null, selectedComic, sortComics);

  if (updateURL && !sameNode) {
    legendDiv.style.display = "none";
    setURL(entity, data.graph.getNodeAttribute(node, "label"), entity, selectedComic, sortComics);
  }

  // Fill sidebar with selected node's details
  const attrs = data.graph.getNodeAttributes(node);
  selectedNode = node;
  selectedNodeLabel = attrs.label;
  nodeLabel.style.display = "inline-block";
  explanations.style.display = "none";
  nodeDetails.style.display = "block";
  if (!sameNode) {
    nodeDetails.scrollTo(0, 0);
    nodeLabel.innerHTML = attrs.label;
    nodeImg.src = fixImage(attrs.image_url)
    nodeImg.onclick = () => {
      modalImg.src = fixImage(attrs.image_url);
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
      nodeExtra.innerHTML += '<p>Attached to the <b style="color: ' + lightenColor(data.communities[attrs.community].color, 25) + '">' + data.communities[attrs.community].label + '</b> <i>family</i></p>';
  } else
    nodeExtra.innerHTML += '<p>The size of the nodes reflects how often ' +
      'the ' + entity + ' are ' +
      (nodeEntity === "creators"
        ? "featured in stories authored by"
        : "credited in stories featuring"
      ) + " " + selectedNodeLabel +
       " within Marvel API's data.</p>";
  if (attrs.url)
    nodeExtra.innerHTML += '<p><a href="' + attrs.url + '" target="_blank">More on Marvel.com…</a></p>';
  if (comicsReady)
    renderHistogram(node);

  selectSuggestions.selectedIndex = allSuggestions.map(x => x.label).indexOf(selectedNodeLabel) + 1;

  const comicEntities = selectedComic && selectedComic[selectedNodeType || entity];
  if (!comicsBarView || !(selectedComic && comicEntities && comicEntities.indexOf(node) !== -1)) {
    if (relatedNodes === null) {
      // Highlight clicked node, make it bigger and hide unconnected ones
      data.graph.setNodeAttribute(node, "highlighted", true);
      renderer.setSetting(
        "nodeReducer", (n, attrs) => n === node
          ? { ...attrs,
              zIndex: 2,
              size: attrs.size * 1.75,
              haloSize: attrs.size * 3.5,
              haloIntensity: 0.75,
            }
          : data.graph.hasEdge(n, node)
            ? { ...attrs,
                haloSize: attrs.size * 2,
                haloIntensity: 0.65,
                zIndex: 1
              }
            : { ...attrs,
                zIndex: 0,
                type: "circle",
                haloIntensity: 0,
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
                color: lightenColor(data.graph.getNodeAttribute(data.graph.opposite(node, edge), 'color'), 25),
                size: Math.max(sigmaDim < 500 ? 1 : 2, Math.log(data.graph.getEdgeAttribute(edge, 'weight')) * sigmaDim / 10000)
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
              size: computeNodeSize(Math.pow(relatedNodes[n] * comicsRatio, 1.3)),
              haloSize: 5 * computeNodeSize(Math.pow(relatedNodes[n] * comicsRatio, 1.3)),
              haloIntensity: 0.05 * Math.log(relatedNodes[n] * comicsRatio),
              zIndex: 2
            }
          : { ...attrs,
              zIndex: 0,
              type: "circle",
              haloIntensity: 0,
              color: "#2A2A2A",
              size: sigmaDim < 500 ? 1 : 2,
              label: null
            }
      );
      renderer.setSetting(
        "edgeReducer", (edge, attrs) =>
          relatedNodes[networks[entity].graph.source(edge)] !== undefined &&
          relatedNodes[networks[entity].graph.target(edge)] !== undefined
            ? { ...attrs,
                zIndex: 0,
                color: '#444',
                size: 1
              }
            : { ...attrs,
                zIndex: 0,
                color: "#FFF",
                hidden: true
              }
      );
    }
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
  comicsBar.style.transform = "scaleY(1)";
  resize(true);
  disableSwitchButtons();
  comicsCache.style.display = "none";
  setTimeout(() => resize(true), 300);

  if (resetTitle && !comicsReady && selectedNodeLabel)
    comicsTitle.innerHTML = "... comics" +
      "&nbsp;" +
      (selectedNodeType === "creators" ? "by" : "with") +
      ' <span class="red">' + selectedNodeLabel.replace(/ /g, "&nbsp;") + '</span>';
  comicsSubtitle.style.display = (selectedNode && creatorsComics[selectedNode] ? "inline-block" : "none");

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
  const graph = networks[entity].graph,
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
      setURL(entity, selectedNodeLabel, selectedNodeType, "", sortComics);
    else selectComic(allComicsMap[selectedComic] || selectedComic, true, autoReselect);
  }

  setTimeout(() => {
    renderHistogram(selectedNode, comics);

    comicsSubtitle.style.display = (selectedNode && creatorsComics[selectedNode] ? "inline-block" : "none");

    if (!comics.length) {
      comicsList.innerHTML = "<b>no comic-book found</b>";
      loaderList.style.display = "none";
      resize(true);
      enableSwitchButtons();
    } else setTimeout(() => {
      const now = new Date() as any;
      buildComicsList({
        comics: comics,
        color: selectedNodeLabel && creatorsComics[selectedNode],
        creatorsRoles: creatorsRoles,
        selectedComic: selectedComic
      }, comicsListData => {
        resize(true);
        if ((new Date() as any) - now > 100)
          showLoader();

        setTimeout(() => {
          if (comicsBarView)
            comicsList.innerHTML = comicsListData.join("");
          if (comicsBarView && autoReselect) {
            if (selectedComic) scrollComicsList();
            comicsCache.style.display = "none";
          }
          hideLoader();
          enableSwitchButtons();
          loaderList.style.display = "none";

          minComicLiHeight = 100;
          setTimeout(() => comicsBarView && comics.filter(c => {
            const comicLi = document.getElementById("comic-" + c.id) as any;
            minComicLiHeight = Math.min(minComicLiHeight, comicLi.getBoundingClientRect().height);
            comicLi.comic = c;
            comicLi.onmouseup = () => {
              preventAutoScroll = true;
              setURL(entity, selectedNodeLabel, selectedNodeType, (selectedComic.id === comicLi.comic.id ? "" : comicLi.comic), sortComics);
            };
            comicLi.onmouseenter = () => selectComic(c);
          }), 50);
        }, 50);
      });
    }, 200);
  }, 200);
}

viewComicsButton.onclick = () => {
  if (hasClass(viewComicsButton, "selected")) return;
  setURL(entity, selectedNodeLabel, selectedNodeType, "", sortComics);
};
document.getElementById("close-bar").onclick =
  () => setURL(entity, selectedNodeLabel, selectedNodeType);

function clearComicDetails() {
  comicTitle.innerHTML = "";
  comicImg.src = "";
  comicDesc.innerHTML = "";
  comicEntities.forEach(el => el.style.display = "none");
  comicCreators.innerHTML = "";
  comicCharacters.innerHTML = "";
  comicUrl.style.display = "none";
}

function unselectComic() {
  logDebug("UNSELECT COMIC", {selectedComic, selectedNodeLabel});
  const graph = networks[entity].graph;
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

  const graph = networks[entity].graph;
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
  comicImg.src = fixImage(comic.image_url);
  modalImg.src = fixImage(comic.image_url, modal.style.display === "block" && modalImgMissing);
  comicImg.onclick = () => {
    modalImg.src = fixImage(comic.image_url, modalImgMissing);
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
    entityLi.onclick = () => setURL(entity, allCreators[c], "creators", selectedComic, sortComics);
  });
  comic.characters.forEach(c => {
    if (!allCharacters[c]) return;
    const entityLi = document.getElementById("character-" + c) as HTMLElement;
    entityLi.onclick = () => setURL(entity, allCharacters[c], "characters", selectedComic, sortComics);
  });
  (document.querySelectorAll(".entity-link") as NodeListOf<HTMLElement>).forEach(setupTooltip);

  renderer.setSetting(
    "nodeReducer", (n, attrs) => comic[entity].indexOf(n) !== -1
      ? { ...attrs,
          zIndex: 2,
          size: attrs.size * 1.75,
          haloSize: attrs.size * 3,
          haloIntensity: 0.75
        }
      : { ...attrs,
          type: "circle",
          haloIntensity: 0,
          zIndex: 0,
          color: "#2A2A2A",
          size: sigmaDim < 500 ? 1 : 2,
          label: null
        }
  );
  renderer.setSetting(
    "edgeReducer", (edge, attrs) =>
      comic[entity].indexOf(graph.source(edge)) !== -1 && comic[entity].indexOf(graph.target(edge)) !== -1
      ? { ...attrs,
          zIndex: 0,
          color: '#666',
          size: sigmaDim < 500 ? 1 : 3
        }
      : { ...attrs,
          zIndex: 0,
          color: "#FFF",
          hidden: true
        }
  );

  if (!preventAutoScroll && keep)
    scrollComicsList();
  preventAutoScroll = false;

  centerNode(null, comic[entity].filter(n => graph.hasNode(n)), false);
}

// Random node button
viewNodeButton.onclick = () => {
  if (hasClass(viewNodeButton, "selected")) return;
  const graph = networks[entity].graph;
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
  (document.querySelectorAll('#view-node, #view-comics, #choices, .left, .right') as NodeListOf<HTMLElement>).forEach(
    el => addClass(el, "selected")
  );
}

function enableSwitchButtons() {
  if (comicsBarView && !comicsReady) return;
  switchNodeType.disabled = false;
  (document.querySelectorAll('#view-node, #choices, .left, .right') as NodeListOf<HTMLElement>).forEach(
    el => rmClass(el, "selected")
  );
  if (comicsReady) rmClass(viewComicsButton, "selected");
}

switchNodeType.onchange = (event) => {
  disableSwitchButtons();
  explanations.style.opacity = "0";
  setURL(switchNodeType.checked ? "creators" : "characters", selectedNodeLabel, selectedNodeType, selectedComic, sortComics);
};


/* -- Interface display -- */

(document.querySelectorAll(".reset-graph") as NodeListOf<HTMLElement>).forEach(el => {
  el.setAttribute("tooltip", "reset graph");
  addClass(el, "tooltip");
  el.onclick = () => {
    if (!renderer) return;
    hideComicsBar();
    setURL(entity);
    setTimeout(() => camera.animate({x: 0.5, y: 0.5, ratio: 1, angle: 0}, {duration: 250}), 100);
  }
});

function showCanvases(showClustersLayer = true) {
  (document.querySelectorAll(".sigma-container canvas") as NodeListOf<HTMLElement>).forEach(canvas => canvas.style.display = "block");
  if (showClustersLayer && clustersLayer && entity === "creators")
    clustersLayer.style.display = "block";
}

function showLoader() {
  loader.style.display = "block";
  loader.style.opacity = "0.5";
  controls.style.opacity = "0.15";
  legendDiv.style.opacity = "0.15";
  comicsActions.style.opacity = "0.15";
}

function hideLoader() {
  if (comicsBarView && !comicsReady)
    return;
  return setTimeout(() => {
    actuallyHideLoader();
    picturesRenderingDelay[entity] = Math.min(picturesRenderingDelay[entity], picturesLoadingDelay / 2);
  }, picturesRenderingDelay[entity]);
}
function actuallyHideLoader() {
  loader.style.display = "none";
  loader.style.opacity = "0";
  controls.style.opacity = "1";
  legendDiv.style.opacity = "0.75";
  comicsActions.style.opacity = "1";
}

function defaultSidebar() {
  explanations.style.display = "block";
  nodeDetails.style.display = "none";
  modal.style.display = "none";
  modalImg.src = "";
  modalImgMissing.style.display = "none";
  if (comicsReady)
    renderHistogram(selectedNode);
}

function hideComicsBar() {
  if (hasClass(filterComics, "selected")) {
    rmClass(filterComics, "selected");
    filterComics.setAttribute("tooltip", "search comics")
    filterSearch.style.display = "none";
    renderHistogram(selectedNode);
  }
  comicsCache.style.display = "none";
  comicsBarView = false;
  comicsBar.style.transform = "scaleY(0)";
  modalNext.style.opacity = "0";
  modalPrev.style.opacity = "0";
  unselectComic();
  selectedComic = null;
  if (entity === "creators" && clustersLayer)
    clustersLayer.style.display = "block";
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
    if (isTouchDevice() && (!e.touches || hasClass(element, "network-switch-label"))) return;
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

(document.querySelectorAll(".tooltip") as NodeListOf<HTMLElement>).forEach(setupTooltip);
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
  setURL(entity, selectedNodeLabel, selectedNodeType, el.comic, sortComics);
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
  modalImgMissing.style.display = "none";
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
  setURL(entity, selectedNodeLabel, selectedNodeType, selectedComic, "alpha");
};

sortDate.onclick = () => {
  setURL(entity, selectedNodeLabel, selectedNodeType, selectedComic, "date");
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
    filterInput.focus();
  }
  resize(true);
  if (filterInput.value)
    refreshFilter();
}

filterInput.oninput = refreshFilter;


/* -- Keystrokes (Esc & Arrow keys) handling -- */

document.onkeydown = function(e) {
  const graph = networks[entity].graph;
  if (!graph || !renderer) return

  if (searchInput === document.activeElement || filterInput === document.activeElement)
    return
  if (modal.style.display === "block" && e.which === 27) {
    modal.style.display = "none";
    modalImgMissing.style.display = "none";
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
        setURL(entity, selectedNodeLabel, selectedNodeType, "", sortComics);
        break;

      default: return; // exit this handler for other keys
    }
  } else if (comicsBarView) {
    if (e.which === 37 || e.which === 38)
      selectAndScroll(document.querySelector("#comics-list li:last-child") as any);
    else if (e.which === 39 || e.which === 40)
      selectAndScroll(document.querySelector("#comics-list li:first-child") as any);
    else if (e.which === 27)
      setURL(entity, selectedNodeLabel, selectedNodeType);
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
modal.ontouchstart = touchStart;
modalImgMissing.ontouchstart = touchStart;
comicImg.ontouchstart = touchStart;
switchTypeLabel.ontouchstart = touchStart;

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
modalImgMissing.ontouchend = modal.ontouchend;

comicImg.ontouchend = e => {
  const typ = touchEnd(e, 30);
  if (typ === "left")
    selectAndScrollSibling("previous");
  else if (typ === "right")
    selectAndScrollSibling("next");
};

switchTypeLabel.ontouchend = e => {
  const typ = touchEnd(e, 20);
  if ((typ === "left" || typ === "right") && !switchNodeType.disabled) {
    switchNodeType.checked = !switchNodeType.checked;
    switchNodeType.onchange(e);
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
  return '<div style="left: calc((100% - 30px) * ' + Math.round(1000 * (year - startYear) / (totalYears - 1)) / 1000 + ')' +
    color + '"' + className + '>' + year + '</div>';
}

function buildHistogram(node, comics) {
  if (histograms[entity][node] && !comics)
    return histograms[entity][node];
  const histo = {
    values: new Array(totalYears).fill(0),
    entityYearMap: {},
    start: curYear,
    end: startYear,
    sum: 0
  };
  (comics || getNodeComics(node)).forEach(c => {
    const comicYear = (new Date(c.date)).getFullYear();
    c[entity].forEach(e => {
      if (!histo.entityYearMap[comicYear]) histo.entityYearMap[comicYear] = {};
      if (!histo.entityYearMap[comicYear][e])
        histo.entityYearMap[comicYear][e] = 0;
      histo.entityYearMap[comicYear][e]++;
    });
    histo.values[comicYear - startYear] += 1;
    histo.start = Math.min(histo.start, comicYear);
    histo.end = Math.max(histo.end, comicYear);
    histo.sum += 1
  });
  if (!comics)
    histograms[entity][node] = histo;
  return histo;
}

histogramContainer.onmouseenter = e => {
  if (!renderer) return;
  currentReducers = {
    nodes: renderer.getSetting("nodeReducer"),
    edges: renderer.getSetting("edgeReducer")
  };
};
histogramContainer.onmouseleave = e => {
  if (!renderer) return;
  renderer.setSetting("nodeReducer", currentReducers.nodes);
  renderer.setSetting("edgeReducer", currentReducers.edges);
};

function renderHistogram(node = null, comics = null) {
  const histogram = buildHistogram(node, comics);

  const maxWidth = divWidth(comicsBarView ? "comics-bar" : "sidebar"),
    heightRatio = 32 / Math.max.apply(Math, histogram.values),
    barWidth = Math.round(1000 * maxWidth / totalYears) / 1000;

  comicsTitle.innerHTML = formatNumber(histogram.sum) + " comic" + (histogram.sum > 1 ? "s" : "") +
    (selectedNodeLabel
      ? "&nbsp;" + (selectedNodeType === "creators" ? "by" : "with") +
        ' <span class="red">' + selectedNodeLabel.replace(/ /g, "&nbsp;") + '</span>'
      : '') +
    " between " + histogram.start + "&nbsp;&amp;&nbsp;" + histogram.end +
    (hasClass(filterComics, "selected") && filterInput.value ? " matching «<i>" + filterInput.value + "</i>»" : "");

  let histo = "";
  histogram.values.forEach((y, idx) => histo +=
    '<span class="histobar" ' +
      'style="width: ' + (100 / totalYears) + '%; ' +
        'height: ' + Math.round(y * heightRatio) + 'px">' +
    '</span>'
  );
  histogramDiv.innerHTML = histo;
  histogramDiv.style.opacity = "1";

  let hover = "";
  histogram.values.forEach((y, idx) => hover +=
    '<span class="histobar-hover" year="' + (startYear + idx) + '" ' +
      'tooltip="' + (y ? y + '&nbsp;comic' + (y > 1 ? 's' : '') + '&nbsp;in&nbsp;' : '') + (startYear + idx) + '" ' +
      'style="width: ' + (100 / totalYears) + '%">' +
    '</span>'
  );
  histogramHover.innerHTML = hover;
  histogramHover.style.opacity = "1";

  const legendYears = [startYear, 1960, 1980, 2000, curYear];
  let legend = ""
  if (legendYears.indexOf(histogram.start) === -1)
    legendYears.push(histogram.start);
  legendYears.sort().forEach(y => {
    if (y + 12 < histogram.start)
      legend += buildLegendItem(y, "old")
    else if (y - 12 > histogram.start)
      legend += buildLegendItem(y);
    else if (y === histogram.start)
      legend += buildLegendItem(histogram.start,
        node === null && (!comics || comics.length === allComics.length)? "" : "start");
  });
  histogramLegend.innerHTML = legend;

  (document.querySelectorAll(".histobar-hover") as NodeListOf<HTMLElement>).forEach(bar => {
    bar.onmouseenter = e => {
      const tooltip = bar.getAttribute("tooltip"),
        year = bar.getAttribute("year");
      if (!tooltip)
        return clearTooltip(e, "histogram-tooltip");
      histoTooltip.innerHTML = tooltip;
      histoTooltip.style.display = "inline-block";
      const dims = bar.getBoundingClientRect(),
        tooltipWidth = divWidth("histogram-tooltip"),
        minLeft = histogramContainer.getBoundingClientRect().x,
        maxLeft = divWidth("sigma-container");
      histoTooltip.style.left = Math.min(maxLeft - minLeft -tooltipWidth - 1, Math.max(3, dims.x - minLeft - tooltipWidth / 2)) + "px";
      if (histogram.entityYearMap[year]) {
        const comicsRatio = allComics.length / histogram.sum;
        renderer.setSetting(
          "nodeReducer", (n, attrs) => histogram.entityYearMap[year][n] !== undefined
            ? { ...attrs,
                size: 1.5 * computeNodeSize(Math.pow(histogram.entityYearMap[year][n] * comicsRatio, 1.3)),
                haloSize: 3.5 * computeNodeSize(Math.pow(histogram.entityYearMap[year][n] * comicsRatio, 1.3)),
                haloIntensity: 0.15 * Math.log(histogram.entityYearMap[year][n] * comicsRatio),
                zIndex: 2
              }
            : { ...attrs,
                zIndex: 0,
                type: "circle",
                haloIntensity: 0,
                color: "#2A2A2A",
                size: sigmaDim < 500 ? 1 : 2,
                label: null
              }
        );
        renderer.setSetting(
          "edgeReducer", (edge, attrs) =>
            histogram.entityYearMap[year][networks[entity].graph.source(edge)] !== undefined &&
            histogram.entityYearMap[year][networks[entity].graph.target(edge)] !== undefined
              ? { ...attrs,
                  zIndex: 0,
                  color: '#444',
                  size: 1
                }
              : { ...attrs,
                  zIndex: 0,
                  color: "#FFF",
                  hidden: true
                }
        );
      }
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
  sideBar.ontouchstart = e => {
    const touch = (e.touches || e.changedTouches)[0];
    if (!touch) return;
    const dims = histogramContainer.getBoundingClientRect(),
      x = touch.clientX,
      y = touch.clientY;
    if (
      x < dims.left || x > dims.right ||
      y < dims.top  || y > dims.bottom
    ) {
      clearTooltip(e, "histogram-tooltip");
      document.querySelectorAll(".histobar-hover.highlighted").forEach(b => rmClass(b, "highlighted"));
    }
  };
  comicsBar.ontouchstart = sideBar.ontouchstart;
}


/* -- Responsiveness handling -- */

let resizing = null;

function resize(fast = false) {
  logDebug("RESIZE");
  if (!fast) resizing = true;

  const graph = entity ? networks[entity].graph : null,
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

  const legendLeft = divWidth("sidebar") + divWidth("controls") + 5;
  legendDiv.style.left = legendLeft + "px";
  legendDiv.style.width = "calc(100% - " +
    (25 + legendLeft +
      (comicsBarView && comicsBar.getBoundingClientRect().x !== 0
        ? divWidth("comics-bar")
        : 0)
    ) + "px)";

  if (!fast && renderer) {
    let maxSize = 0;
    graph.updateEachNodeAttributes((node, attrs) => {
      const size = computeNodeSize(attrs.stories);
      maxSize = Math.max(maxSize, size);
      return {
        ...attrs,
        size: size,
        borderSize: sigmaDim / 1500,
        haloSize: size * 5
      };
    }, {attributes: ['size', 'borderSize', 'haloSize']});
    renderer.setSetting("labelRenderedSizeThreshold", maxSize - 5);
  }
  if (!fast) resizing = false;
}

window.onresize = () => {
  if (resizing === true) return;
  if (resizing) clearTimeout(resizing);
  resizing = setTimeout(resize, 0);
};


/* -- URL actions routing -- */

function setURL(ent, sel = null, selType = null, comics = null, sort = "date") {
  const opts = [];
  if (sel !== null && !(ent === selType && !(networks[ent].graph && networks[ent].graph.findNode((node, {label}) => label === sel))))
    opts.push((selType || ent).replace(/s$/, "") + "=" + sel.replace(/ /g, "+"));
  if (comics !== null) {
    opts.push("comics" + (comics ? "=" + comics.id : ""));
    if (sort === "alpha")
      opts.push("sort=" + sort);
  }

  window.location.hash = "/" + ent + "/" + (opts.length ? "?" + opts.join("&") : "");
}

function readURL() {
  const args = window.location.hash
    .replace(/^#\//, '')
    .split(/\/\??/);
  if (args.length !== 2
    || ["characters", "creators"].indexOf(args[0]) === -1
  ) return setURL("characters");
  const opts = Object.fromEntries(
    args[1].split("&")
    .map(o => /=/.test(o) ? o.split("=") : [o, ""])
    .filter(o => ["creator", "character", "comics", "sort"].indexOf(o[0]) !== -1)
  );

  const ent = args[0],
    reload = ent !== entity;

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

  const dispc = (shouldComicsBarView && !comicsBarView) || selectedComic !== oldComic || sortComics !== oldSort;

  logDebug("READ URL", {args, ent, opts, reload, clickn, oldNodeLabel, selectedNodeLabel, dispc, oldComic, selectedComic, shouldComicsBarView, oldSort, sortComics});

  // Update titles
  let title = "Marvel's " + ent + " " +
    (ent === "creators" ? "credited" : "featured") +
    " together within same&nbsp;comics";
  if (selectedNodeLabel)
    title += " " + (selectedNodeType === ent
      ? "as"
      : (selectedNodeType === "creators"
        ? "from"
        : "casting")) + " ";
  document.querySelector("title").innerHTML = "MARVEL graphs &mdash; Map of " + title + (selectedNodeLabel || "");
  document.getElementById("title").innerHTML = title.replace(ent, '<span class="red">' + ent + '</span>');
  nodeLabel.style.display = (selectedNodeLabel ? "inline-block" : "none");
  nodeLabel.innerHTML = selectedNodeLabel;
  resize(true);

  if (reload) {
    // Hide canvases
    (document.querySelectorAll(".sigma-container canvas") as NodeListOf<HTMLElement>).forEach(canvas => canvas.style.display = "none");
    if (clustersLayer) {
      clustersLayer.innerHTML = "";
      clustersLayer.style.display = "none";
    }
    showLoader();
    loader.style.opacity = "1";

    // Clear highlighted node from previous graph so it won't remain further on
    if (entity && selectedNode) {
      const prevGraph = networks[entity].graph;
      if (prevGraph && prevGraph.hasNode(selectedNode))
        prevGraph.setNodeAttribute(selectedNode, "highlighted", false);
    }

    // Setup Sidebar default content
    orderSpan.innerHTML = '...';

    if (ent === "creators")
      Object.keys(creatorsRoles).forEach(k => {
        const role = document.getElementById(k + "-color");
        role.style.color = lightenColor(creatorsRoles[k]);
        role.innerHTML = k + " (...)";
      });
    else document.querySelectorAll("#clusters-legend .color")
      .forEach(el => el.innerHTML = "...");
  }

  // Setup Node type switch
  switchNodeType.checked = ent === "creators";
  entity = ent;
  entitySpans.forEach(span => span.innerHTML = entity);
  charactersDetailsSpans.forEach(span => span.style.display = (entity === "characters" ? "inline" : "none"));
  creatorsDetailsSpans.forEach(span => span.style.display = (entity === "creators" ? "inline" : "none"));
  document.getElementById("cooccurrence-threshold").innerHTML = conf["cooccurrence_threshold_for_" + entity];

  // Update tooltips
  viewComicsButton.setAttribute("tooltip",
    "browse the list of " +
    (!selectedNodeLabel ? "all comics and their associated creators & characters" :
      "comics listed as " +
      (selectedNodeType === "creators" ? "authored by" : "featuring") +
      " '" + selectedNodeLabel + "'"
    )
  );
  searchInput.setAttribute("tooltip", (selectedNodeLabel
    ? "change focused 'entity'"
    : "search a specific 'entity' in the graph")
  );
  switchTypeLabel.setAttribute("tooltip", "switch to the network of '" +
    (entity === "creators" ? "characters" : "creators") + "'" +
    (!selectedNodeLabel ? "" : " " +
      (entity === "creators" ? "featured" : "credited") +
      " in comics " +
      (selectedNodeType === "creators" ? "from" : "with") +
      " '" + selectedNodeLabel + "'")
  );
  if (sortComics === "date") {
    sortDate.setAttribute("tooltip", "comics are ordered by 'publication date'");
    sortAlpha.setAttribute("tooltip", "sort comics by 'title &amp; issue number'");
  } else {
    sortDate.setAttribute("tooltip", "sort comics by 'publication date'");
    sortAlpha.setAttribute("tooltip", "comics are ordered by 'title and issue number'");
  }

  const graph = networks[entity].graph;
  if (reload)
    setTimeout(() => {
      // If graph already loaded, just render it
      stopPlayComics();
      if (graph)
        renderNetwork(shouldComicsBarView);
      // Otherwise load network file
      else loadNetwork(entity, () => renderNetwork(shouldComicsBarView));
    }, 0);
  else if (clickn) {
    stopPlayComics();
    let network = networks[entity];
    if (selectedNodeType !== entity) {
      loadNetwork(selectedNodeType, () => {
        clickNode(networks[selectedNodeType].graph.findNode((n, {label}) => label === selectedNodeLabel), false);
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

disableSwitchButtons();

comicsSubtitle.innerHTML = "as " + Object.keys(creatorsRoles)
  .map(x => '<span style="color: ' + lightenColor(creatorsRoles[x]) + '">' + x + '</span>')
  .join(",&nbsp;")
  .replace(/,&nbsp;([^&]+)$/, " or $1");

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
