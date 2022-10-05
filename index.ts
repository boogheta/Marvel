/* TODO:
- fix phone touch graph unclicks
- bind url with selected comic?
- display creators/characters by comic (with link actions?)
- button Explore All comics
- allow only comics full list searchable
- sortable/filterable list?
- one more check with takoyaki on authors/characters labels + readjust louvain after
- check bad data marvel http://gateway.marvel.com/v1/public/stories/186542/creators incoherent with https://www.marvel.com/comics/issue/84372/damage_control_2022_1
=> scraper comics as counter-truth? :
 - Writer:
 - Penciler: (check other names + different format with multiple ones
 - Description, find good one
IDEAS:
- reset regular position for smartphone and keep double bar except low width?
- test bipartite network between authors and characters filtered by category of author
*/

import pako from "pako";

import Papa from "papaparse";

import Graph from "graphology";
import { animateNodes } from "./sigma.js/utils/animate";

import { Sigma } from "./sigma.js";
import { Coordinates } from "./sigma.js/types";
import getNodeProgramImage from "./sigma.js/rendering/webgl/programs/node.image";

// Init global vars
let entity = "",
  networkSize = "",
  view = "",
  selectedNode = null,
  selectedNodeLabel = null,
  renderer = null,
  camera = null,
  sigmaDim = null,
  suggestions = [],
  comicsReady = null,
  comicsBarView = false,
  selectedComic = null;

const conf = {},
  networks = {},
  charactersComics = {},
  creatorsComics = {},
  creatorsRoles = {
    writer: "#234fac",
    artist: "#2b6718",
    both: "#d4a129"
  },
  clusters = {
    creators: {
      "Silver Age": {
        match: ["Stan Lee", "Steve Ditko", "Jack Kirby"],
        color: "#DDDDDD"
      },
      "Bronze Age": {
        match: ["Chris Claremont", "John Byrne", "Jim Starlin"],
        color: "#ff993e"
      },
      "Modern Age": {
        match: ["Jeph Loeb", "Kurt Busiek", "Peter David", "Mark Waid"],
        color: "#bce25b"
      },
      "Millenium Age": {
        match: ["Kelly Thompson", "Brian Michael Bendis", "Dan Slott"],
        color: "#5fb1ff"
      }
    },
    characters: {
      "Avengers": {
        match: ["Avengers"],
        color: "#2b6718"
      },
      "X-Men": {
        match: ["X-Men"],
        color: "#d4a129"
      },
      "Spider-Man & Marvel Knights": {
        match: ["Spider-Man (Peter Parker)"],
        color: "#822e23"
      },
      "Fantastic Four & Cosmic heroes": {
        match: ["Fantastic Four"],
        color: "#234fac"
      },
      "Ultimate Universe": {
        match: ["Ultimates"],
        color: "#57b23d"
      },
      "Alpha Flight": {
        match: ["Alpha Flight"],
        hide: true,
        color: "#8d32a7"
      },
      "Starjammers": {
        match: ["Corsair"],
        hide: true,
        color: "#bce25b"
      },
      "Heroes for Hire": {
        match: ["Fat Cobra"],
        hide: true,
        color: "#c45ecf"
      },
      "Diverse Heroes": {
        match: ["Gorilla Man"],
        hide: true,
        color: "#bce25b"
      },
      "New Mutants & Young X-Men": {
        match: ["Rockslide"],
        hide: true,
        color: "#ff993e"
      },
      "X-Statix": {
        match: ["Dead Girl"],
        hide: true,
        color: "#5fb1ff"
      }
    }
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
    "#c45ecf"
  ];

// Init global vars for each view variant
["creators", "characters"].forEach(e => {
  networks[e] = {};
  ["small", "full"].forEach(s => {
    networks[e][s] = {
      graph: null,
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
function meanArray(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function formatMonth(dat) {
  const d = new Date(dat);
  return monthNames[new Date(dat).getMonth()] + " " + dat.slice(0, 4);
}

const container = document.getElementById("sigma-container") as HTMLElement,
  loader = document.getElementById("loader") as HTMLElement,
  loaderComics = document.getElementById("loader-comics") as HTMLElement,
  modal = document.getElementById("modal") as HTMLElement,
  modalImg = document.getElementById("modal-img") as HTMLImageElement,
  sideBar = document.getElementById("sidebar") as HTMLImageElement,
  explanations = document.getElementById("explanations") as HTMLElement,
  orderSpan = document.getElementById("order") as HTMLElement,
  nodeDetails = document.getElementById("node-details") as HTMLElement,
  nodeLabel = document.getElementById("node-label") as HTMLElement,
  nodeImg = document.getElementById("node-img") as HTMLImageElement,
  nodeExtra = document.getElementById("node-extra") as HTMLElement,
  comicsBar = document.getElementById("comics-bar") as HTMLImageElement,
  comicsDiv = document.getElementById("comics") as HTMLImageElement,
  comicsTitle = document.getElementById("comics-title") as HTMLElement,
  comicsSubtitleList = document.getElementById("comics-subtitle-list") as HTMLElement,
  comicsSubtitleExtra = document.getElementById("comics-subtitle-extra") as HTMLElement,
  comicsList = document.getElementById("comics-list") as HTMLElement,
  comicsCache = document.getElementById("comics-cache") as HTMLElement,
  comicTitle = document.getElementById("comic-title") as HTMLLinkElement,
  comicUrl = document.getElementById("comic-url") as HTMLLinkElement,
  comicImg = document.getElementById("comic-img") as HTMLImageElement,
  comicDesc = document.getElementById("comic-desc") as HTMLLinkElement,
  searchInput = document.getElementById("search-input") as HTMLInputElement,
  searchSuggestions = document.getElementById("suggestions") as HTMLDataListElement,
  selectSuggestions = document.getElementById("suggestions-select") as HTMLSelectElement,
  switchNodeType = document.getElementById("node-type-switch") as HTMLInputElement,
  switchNodeFilter = document.getElementById("node-filter-switch") as HTMLInputElement,
  switchNodeView = document.getElementById("node-view-switch") as HTMLInputElement,
  entitySpans = document.querySelectorAll(".entity") as NodeListOf<HTMLElement>,
  charactersDetailsSpans = document.querySelectorAll(".characters-details") as NodeListOf<HTMLElement>,
  creatorsDetailsSpans = document.querySelectorAll(".creators-details") as NodeListOf<HTMLElement>,
  colorsDetailsSpans = document.querySelectorAll(".colors-details") as NodeListOf<HTMLElement>,
  picturesDetailsSpans = document.querySelectorAll(".pictures-details") as NodeListOf<HTMLElement>,
  smallDetailsSpans = document.querySelectorAll(".small-details") as NodeListOf<HTMLElement>,
  fullDetailsSpans = document.querySelectorAll(".full-details") as NodeListOf<HTMLElement>;

modal.onclick = () => modal.style.display = "none";
comicsCache.onwheel = () => comicsCache.style.display = "none";
comicsCache.onmousedown = comicsCache.onwheel;
comicsCache.onmouseout = comicsCache.onwheel;

function divWidth(divId) {
  return document.getElementById(divId).getBoundingClientRect().width;
}
function divHeight(divId) {
  return document.getElementById(divId).getBoundingClientRect().height;
}

function setPermalink(ent, siz, vie, sel) {
  const graph = networks[entity][networkSize].graph,
    selection = ent === entity && sel && graph && graph.hasNode(sel) ? "/" + graph.getNodeAttribute(sel, "label").replace(/ /g, "+") : "";
  if ((ent !== entity || siz !== networkSize) && graph && selectedNode) {
    graph.setNodeAttribute(selectedNode, "highlighted", false);
    selectedNode = null;
    selectedNodeLabel = null;
  }
  window.location.hash = ent + "/" + siz + "/" + vie + selection;
}

function defaultSidebar() {
  explanations.style.display = "block";
  explanations.scrollTo(0, 0);
  nodeDetails.style.display = "none";
  nodeDetails.scrollTo(0, 0);
  modal.style.display = "none";
  modalImg.src = "";
  nodeLabel.innerHTML = "";
  nodeImg.src = "";
  nodeExtra.innerHTML = "";
  resize();
}

function hideComicsBar() {
  const graph = networks[entity][networkSize].graph,
    clustersLayer = document.getElementById("clusters-layer");
  comicsBarView = false;
  comicsBar.style.opacity = "0";
  comicsBar.style["z-index"] = "-1";
  unselectComic();
  if (graph && entity === "creators" && clustersLayer)
    clustersLayer.style.display = "block";
}
document.getElementById("close-bar").onclick = hideComicsBar;

function computeNodeSize(node, stories) {
  return Math.pow(stories, 0.2)
    * (entity === "characters" ? 1.75 : 1.25)
    * (networkSize === "small" ? 1.75 : 1.25)
    * sigmaDim / 1000
};

function centerNode(node, neighbors = null, force = true) {
  if (!camera || !node) return;

  const graph = networks[entity][networkSize].graph;
  if (!neighbors)
    neighbors = graph.neighbors(node);

  let x0, x1, y0, y1;
  neighbors.forEach(n => {
      const attrs = renderer.getNodeDisplayData(n);
      if (!x0 || x0 > attrs.x) x0 = attrs.x;
      if (!x1 || x1 < attrs.x) x1 = attrs.x;
      if (!y0 || y0 > attrs.y) y0 = attrs.y;
      if (!y1 || y1 < attrs.y) y1 = attrs.y;
    });
  const shift = sideBar.getBoundingClientRect()["x"] === 0 && comicsBar.style.opacity === "1"
    ? divWidth("comics-bar")
    : 0,
    leftCorner = renderer.framedGraphToViewport({x: x0, y: y0}),
    rightCorner = renderer.framedGraphToViewport({x: x1, y: y1}),
    viewPortPosition = renderer.framedGraphToViewport({
      x: (x0 + x1) / 2 ,
      y: (y0 + y1) / 2
    }),
    sigmaDims = document.getElementById("sigma-container").getBoundingClientRect();

  // Handle comicsbar hiding part of the graph
  sigmaDims.width -= shift;
  // Evaluate required zoom ratio
  let ratio = 1.5 / Math.min(
    (sigmaDims.width - shift) / (rightCorner.x - leftCorner.x),
    sigmaDims.height / (leftCorner.y - rightCorner.y)
  );
  viewPortPosition.x += ratio * shift / 2 ;

  // Evaluate acceptable window
  const xMin = 15 * sigmaDims.width / 100,
    xMax = 85 * sigmaDims.width / 100,
    yMin = 15 * sigmaDims.height / 100,
    yMax = 85 * sigmaDims.height / 100;

  // Zoom on node only if force, if more than 2 neighbors and outside acceptable window or nodes quite close togethern, or if outside full window or nodes really close together
  if (force ||
    (neighbors.length > 2 && (leftCorner.x < xMin || rightCorner.y < yMin || rightCorner.x > xMax || leftCorner.y > yMax || ratio < 0.35)) ||
    (leftCorner.x < 0 || rightCorner.y < 0 || rightCorner.x > sigmaDims.width || leftCorner.y > sigmaDims.height || (ratio !== 0 && ratio < 0.2))
  ) {
    if (ratio < 0.35) ratio = 2 * ratio;
    camera.animate(
      {
        ...renderer.viewportToFramedGraph(viewPortPosition),
        ratio: camera.ratio * Math.sqrt(ratio)
      },
      {duration: 300}
    );
  }
}

function loadComics(comicsData) {
  const comicsStr = pako.ungzip(comicsData, {to: "string"});
  Papa.parse(comicsStr, {
	worker: true,
    header: true,
    skipEmptyLines: "greedy",
	step: function(c) {
      c = c.data;

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

	},
	complete: function() {
      comicsReady = true;
      loaderComics.style.display = "none";
      if (selectedNode)
        addViewComicsButton(selectedNode);
    }
  });
}

//const sortableTitle = s => s.replace(/^(.*) \((\d+)\).*$/, "$2 - $1 / ") + s.replace(/^.*#(\d+.*)$/, "$1").padStart(8, "0");

function displayComics(node) {
  const comics = (entity === "characters" ? charactersComics : creatorsComics)[node];
  selectComic(
    (selectedComic && comics.filter(c => c.id === selectedComic.id).length
      ? selectedComic
      : null),
    true
  );

  comicsBarView = true;
  comicsBar.style.opacity = "1";
  comicsBar.style["z-index"] = "1";
  if (entity === "creators")
    document.getElementById("clusters-layer").style.display = "none";
  comicsTitle.innerHTML = "";
  comicsSubtitleList.innerHTML = "";
  comicsSubtitleExtra.style.display = (entity === "creators" ? "inline" : "none");
  if (comics) {
    comicsTitle.innerHTML = comics.length + " comic" + (comics.length > 1 ? "s" : "") + " listing<br/>"
      + networks[entity][networkSize].graph.getNodeAttribute(node, "label");
    if (entity === "creators")
      comicsSubtitleList.innerHTML = Object.keys(creatorsRoles)
        .map(x => '<span style="color: ' + lighten(creatorsRoles[x], 50) + '">' + x + '</span>')
        .join("&nbsp;")
        .replace(/&nbsp;([^&]+)$/, " or $1");
  }
  comicsList.innerHTML = comics
    ? comics.sort((a, b) => a.date < b.date ? -1 : (a.date === b.date ? 0 : 1))
    //? comics.sort((a, b) => sortableTitle(a.title).localeCompare(sortableTitle(b.title), { numeric: true }))  # Sort by title
      .map(x => '<li id="comic-' + x.id + '"' + (entity === "creators" ? ' style="color: ' + lighten(creatorsRoles[x.role], 50) + '"' : "") + (selectedComic && x.id === selectedComic.id ? ' class="selected"' : "") + '>' + x.title + "</li>")
      .join("")
    : "No comic-book found.";
  comics.forEach(c => {
    const comicLi = document.getElementById("comic-" + c.id) as any;
    comicLi.comic = c;
    comicLi.onmouseup = () => selectComic(c, true);
    comicLi.onmouseenter = () => selectComic(c);
  });
  if (selectedComic) scrollComicsList();
  resize();
}
function scrollComicsList() {
  setTimeout(() => {
    const offset = document.querySelector("#comics-list li.selected") as HTMLElement;
    if (!offset) return;
    comicsDiv.scrollTo(0, offset.offsetTop - (divHeight("comics") / 2));
  }, 10);
}
function selectAndScroll(el) {
  if (!el) return;
  selectComic(el.comic, true);
  scrollComicsList();
}

comicsList.onmouseleave = () => {
  if (!selectedComic)
    clickNode(selectedNode);
};

// Key Arrow handling on comics list
document.onkeydown = function(e) {
  const graph = networks[entity][networkSize].graph;
  if (!graph || !renderer) return

  if (modal.style.display === "block" && e.which === 27)
    modal.style.display = "none";
  else if (selectedComic) {
    const selected = document.querySelector("#comics-list li.selected") as any,
      prev = selected.previousElementSibling as any,
      next = selected.nextElementSibling as any;
    switch(e.which) {
      case 37: // left
        selectAndScroll(prev);
        break;
      case 38: // up
        selectAndScroll(prev);
        break;

      case 39: // right
        selectAndScroll(next);
        break;
      case 40: // down
        selectAndScroll(next);
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
      clickNode(null, true);
    else return;
  } else return;
  e.preventDefault(); // prevent the default action (scroll / move caret)
};

function unselectComic() {
  const graph = networks[entity][networkSize].graph;
  selectedComic = null;
  selectComic(null, true);
  if (selectedNode && graph.hasNode(selectedNode)) {
    clickNode(selectedNode, false);
    centerNode(selectedNode);
  }
}

function selectComic(comic = null, keep = false) {
  const graph = networks[entity][networkSize].graph;
  if (!graph || !renderer) return;

  if (keep && comic && selectedComic && comic.id === selectedComic.id) {
    comic = null;
    unselectComic();
  }

  if (!comic || !selectedComic || comic.id !== selectedComic.id) {
    comicTitle.innerHTML = "";
    comicImg.src = "";
    comicDesc.innerHTML = "";
    comicUrl.style.display = "none";
  }

  if (keep) {
    selectedComic = comic;
    document.querySelectorAll("#comics-list li.selected").forEach(el =>
      el.className = ""
    );
    if (comic) {
      const comicLi = document.getElementById("comic-" + comic.id);
      comicLi.className = "selected";
      comicsCache.style.display = "block";
    }
  }

  if (comic && selectedNode && graph.hasNode(selectedNode))
    graph.setNodeAttribute(selectedNode, "highlighted", false)

  if (!comic || !selectedComic || comic.id !== selectedComic.id)
    document.getElementById("comic-details").scrollTo(0, 0);

  if (!comic) {
    if (!keep && selectedComic)
      selectComic(selectedComic);
    return;
  }

  comicTitle.innerHTML = formatMonth(comic.date);
  comicImg.src = comic.image_url.replace(/^http:/, '');
  modalImg.src = comic.image_url.replace(/^http:/, '');
  comicImg.onclick = () => {
    modal.style.display = "block";
  };
  comicDesc.innerHTML = comic.description;
  comicUrl.style.display = "inline";
  comicUrl.href = comic.url;

  renderer.setSetting(
    "nodeReducer", (n, attrs) => {
      return comic[entity].indexOf(n) !== -1
        ? { ...attrs,
            zIndex: 2,
            size: attrs.size * 1.75
          }
        : { ...attrs,
            zIndex: 0,
            color: "#2A2A2A",
            image: null,
            size: sigmaDim / 350,
            label: null
          };
    }
  );
  renderer.setSetting(
    "edgeReducer", (edge, attrs) =>
      comic[entity].indexOf(graph.source(edge)) !== -1 && comic[entity].indexOf(graph.target(edge)) !== -1
        ? { ...attrs,
            zIndex: 0,
            color: '#333',
            size: 2
          }
        : { ...attrs,
            zIndex: 0,
            color: "#FFF",
            hidden: true
          }
  );

  centerNode(selectedNode, comic[entity].filter(n => graph.hasNode(n)), false);
}

function buildNetwork(networkData) {
  const data = networks[entity][networkSize];
  // Parse pako zipped graphology serialized network JSON
  data.graph = Graph.from(JSON.parse(pako.inflate(networkData, {to: "string"})));

  // Identify community ids of main hardcoded colors
  data.graph.forEachNode((node, {x, y, label, community}) => {
    for (var cluster in data.clusters)
      if (data.clusters[cluster].match.indexOf(label) !== -1) {
        if (entity === "creators") {
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
  data.graph.forEachNode((node, {x, y, stories, image, artist, writer, community}) => {
    const artist_ratio = (entity === "creators" ? artist / (writer + artist) : undefined),
      role = artist_ratio > 0.65 ? "artist" : (artist_ratio < 0.34 ? "writer" : "both"),
      color = (entity === "characters"
        ? (data.communities[community] || {color: extraPalette[community % extraPalette.length]}).color
        : creatorsRoles[role]
      ),
      key = entity === "characters" ? community : role;
    if (!data.counts[key])
      data.counts[key] = 0;
    data.counts[key]++;
    data.graph.mergeNodeAttributes(node, {
      type: "thumbnail",
      image: /available/i.test(image) ? "" : image,
      size: computeNodeSize(node, stories),
      color: color,
      hlcolor: color
    });
  });

  if (entity === "creators") {
    // Calculate positions of ages labels
    for (const cluster in data.clusters) {
      data.clusters[cluster].x = meanArray(data.clusters[cluster].positions.map(n => n.x));
      data.clusters[cluster].y = meanArray(data.clusters[cluster].positions.map(n => n.y));
    }
  }
}

function renderNetwork(firstLoad = false) {
  const data = networks[entity][networkSize];

  // Feed communities size to explanations
  orderSpan.innerHTML = fmtNumber(data.graph.order);
  if (entity === "creators") {
    Object.keys(creatorsRoles).forEach(k => {
      const role = document.getElementById(k + "-color");
      role.style.color = creatorsRoles[k];
      role.innerHTML = k + " (" + fmtNumber(data.counts[k]) + ")";
    })
  } else document.getElementById("clusters-legend").innerHTML = Object.keys(data.clusters)
    .filter(k => !data.clusters[k].hide)
    .map(k =>
      '<b style="color: ' + data.clusters[k].color + '">'
      + k.split(" ").map(x => '<span>' + x + '</span>').join(" ")
      + ' (<span class="color">' + fmtNumber(data.counts[data.clusters[k].community]) + '</span>)</b>'
    ).join(", ");

  // Instantiate sigma:
  let sigmaSettings = {
    minCameraRatio: 0.07,
    maxCameraRatio: 100,
    defaultEdgeColor: '#2A2A2A',
    labelWeight: 'bold',
    labelFont: 'monospace',
    labelColor: view === "pictures" ? {attribute: 'color'} : {color: '#999'},
    labelGridCellSize: 180,
    labelRenderedSizeThreshold: ((networkSize === "small" ? 6 : 4) + (entity === "characters" ? 1 : 0)) * sigmaDim / 1000,
    nodesSizeZoomAdjuster: ratio => Math.pow(ratio, 0.75),
    nodeProgramClasses: {
      thumbnail: getNodeProgramImage()
    }
  };
  renderer = new Sigma(data.graph as any, container, sigmaSettings);

  // Render clusters labels layer on top of sigma for creators
  let clustersLayer = null;
  if (entity === "creators") {
    clustersLayer = document.createElement("div");
    clustersLayer.id = "clusters-layer";
    clustersLayer.style.display = "none";
    let clusterLabelsDoms = "";
    for (const cluster in data.clusters) {
      const c = data.clusters[cluster];
      // adapt the position to viewport coordinates
      const viewportPos = renderer.graphToViewport(c as Coordinates);
      clusterLabelsDoms += '<div id="community-' + c.id + '" class="clusterLabel" style="top: ' + viewportPos.y + 'px; left: ' + viewportPos.x + 'px; color: ' + c.color + '">' + c.label + '</div>';
    }
    clustersLayer.innerHTML = clusterLabelsDoms;
    // insert the layer underneath the hovers layer
    container.insertBefore(clustersLayer, document.getElementsByClassName("sigma-hovers")[0]);

    // Clusters labels position needs to be updated on each render
    renderer.on("afterRender", () => {
      const sigmaWidth = divWidth("sigma-container");
      clustersLayer.style.width = sigmaWidth + "px";
      for (const cluster in data.clusters) {
        const c = data.clusters[cluster];
        const clusterLabel = document.getElementById("community-" + c.id);
        // update position from the viewport
        const viewportPos = renderer.graphToViewport(c as Coordinates);
        if (viewportPos.x < 5 * cluster.length || viewportPos.x > sigmaWidth - 5 * cluster.length)
          clusterLabel.style.display = "none";
        else {
          clusterLabel.style.display = "block";
          clusterLabel.style["min-width"] = (10 * cluster.length) + "px";
          clusterLabel.style.top = viewportPos.y + 'px';
          clusterLabel.style.left = viewportPos.x + 'px';
        }
      }
    });
  }

  // Bind zoom manipulation buttons
  camera = renderer.getCamera();
  document.getElementById("zoom-in").onclick = () => {
    camera.animatedZoom({ duration: 600 });
  };
  document.getElementById("zoom-out").onclick = () => {
    camera.animatedUnzoom({ duration: 600 });
  };
  document.getElementById("zoom-reset").onclick = () => {
    camera.animatedReset({ duration: 600 });
  };

  // Add pointer on hovering nodes
  renderer.on("enterNode", () => container.style.cursor = "pointer");
  renderer.on("leaveNode", () => container.style.cursor = "default");

  // Handle clicks on nodes
  renderer.on("clickNode", (event) => clickNode(event.node));
  renderer.on("clickStage", () => {
    if (comicsBarView)
      hideComicsBar();
    else setSearchQuery()
  });

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
      data.graph.forEachNode((node, {label}) => {
        if (label.toLowerCase().includes(lcQuery))
          suggestions.push({node: node, label: label});
      });

      const suggestionsMatch = suggestions.filter(x => x.label === query);
      if (suggestionsMatch.length === 1) {
        clickNode(suggestionsMatch[0].node);
        // Move the camera to center it on the selected node and its neighbors:
        centerNode(selectedNode);
        suggestions = [];
      } else if (selectedNode) {
        clickNode(null);
      }
    } else if (selectedNode) {
      clickNode(null);
      feedAllSuggestions();
    }
    searchSuggestions.innerHTML = suggestions
      .sort((a, b) => a.label < b.label ? -1 : 1)
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
  camera.ratio = Math.pow(5, 3);
  const initLoop = setInterval(() => {
    loader.style.display = "none";
    document.querySelectorAll("canvas").forEach(canvas => canvas.style.display = "block");
    if (!camera) return clearInterval(initLoop);
    if (camera.ratio <= 5) {
      if (entity === "creators")
        clustersLayer.style.display = "block";
      camera.animate({ratio: 1}, {duration: 100, easing: "linear"});
      renderer.setSetting("maxCameraRatio", 1.3);
      clickNode(data.graph.findNode((n, {label}) => label === selectedNodeLabel), false);
      selectedNodeLabel = null;
      if (comicsReady === null) {
        comicsReady = false;
        loaderComics.style.display = "block";
        fetch("./data/Marvel_comics.csv.gz")
          .then((res) => res.arrayBuffer())
          .then((content) => loadComics(content))
      }
      return clearInterval(initLoop);
    }
    camera.animate({ratio: camera.ratio / 5}, {duration: 100, easing: "linear"});
  }, firstLoad ? 250 : 0);
}

function addViewComicsButton(node) {
  nodeExtra.innerHTML += '<p id="view-comics"><span>Explore comics!</span></p>';
  document.getElementById('view-comics').onclick = () => {
    displayComics(node);
    comicsCache.style.display = "none";
  };
}

function clickNode(node, updateURL=true) {
  const data = networks[entity][networkSize];
  if (!data.graph || !renderer) return;
  // Unselect previous node
  const sameNode = (node === selectedNode);
  if (selectedNode) {
    if (data.graph.hasNode(selectedNode))
      data.graph.setNodeAttribute(selectedNode, "highlighted", false)
    selectedNode = null;
  }

  // Reset unselected node view
  if (!node) {
    selectedNode = null;
    selectedNodeLabel = null;
    nodeImg.src = "";
    modalImg.src = "";
    if (updateURL)
      setPermalink(entity, networkSize, view, node);
    selectSuggestions.selectedIndex = 0;
    defaultSidebar();
    hideComicsBar();
    renderer.setSetting(
      "nodeReducer", (n, attrs) => (view === "pictures" ? attrs : { ...attrs, image: null })
    );
    renderer.setSetting(
      "edgeReducer", (edge, attrs) => attrs
    );
    renderer.setSetting(
      "labelColor", view === "pictures" ? {attribute: 'color'} : {color: '#999'}
    );
    return;
  }

  selectedNode = node;
  if (updateURL)
    setPermalink(entity, networkSize, view, node);

  // Fill sidebar with selected node's details
  const attrs = data.graph.getNodeAttributes(node);
  explanations.style.display = "none";
  nodeDetails.style.display = "block";
  nodeDetails.scrollTo(0, 0);
  nodeLabel.innerHTML = attrs.label;
  nodeImg.src = attrs.image_url.replace(/^http:/, '');
  nodeImg.onclick = () => {
    modalImg.src = attrs.image_url.replace(/^http:/, '');
    modal.style.display = "block";
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

  // Highlight clicked node and make it bigger always with a picture and hide unconnected ones
  data.graph.setNodeAttribute(node, "highlighted", true);
  function dataConnected(attrs) {
    const res = {
      ...attrs,
      zIndex: 1,
      hlcolor: null
    }
    if (view === "colors")
      res.image = null;
    return res;
  }
  renderer.setSetting(
    "nodeReducer", (n, attrs) => {
      return n === node
        ? { ...attrs,
            zIndex: 2,
            size: attrs.size * 1.75
          }
        : data.graph.hasEdge(n, node)
          ? dataConnected(attrs)
          : { ...attrs,
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
    "edgeReducer", (edge, attrs) =>
      data.graph.hasExtremity(edge, node)
        ? { ...attrs,
            zIndex: 0,
            color: lighten(data.graph.getNodeAttribute(data.graph.opposite(node, edge), 'color'), 75),
            size: Math.max(0.1, Math.log(data.graph.getEdgeAttribute(edge, 'weight') * sigmaDim / 200000))
          }
        : { ...attrs,
            zIndex: 0,
            color: "#FFF",
            hidden: true
          }
  );
  renderer.setSetting(
    "labelColor", {attribute: "hlcolor", color: "#CCC"}
  );

  if (comicsBarView) {
    displayComics(node);
    comicsCache.style.display = "none";
  }
  if (!sameNode)
    comicsDiv.scrollTo(0, 0);
  if (!updateURL)
    setTimeout(() => centerNode(node), 300);
};

// Click a random node button
document.getElementById("view-node").onclick = () => {
  const graph = networks[entity][networkSize].graph;
  if (!graph || !renderer)
    return;
  const node = graph.nodes()[Math.floor(Math.random() * graph.order)];
  clickNode(node);
}

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
function setEntity(val) {
  entity = val;
  entitySpans.forEach(span => span.innerHTML = val);
  charactersDetailsSpans.forEach(span => span.style.display = (val === "characters" ? "inline-block" : "none"));
  creatorsDetailsSpans.forEach(span => span.style.display = (val === "creators" ? "inline" : "none"));
  document.getElementById("min-stories").innerHTML = conf["min_stories_for_" + val];
  document.getElementById("cooccurrence-threshold").innerHTML = conf["cooccurrence_threshold_for_" + entity];
}

function setSize(val) {
  networkSize = val;
  smallDetailsSpans.forEach(span => span.style.display = (val === "small" ? "inline" : "none"));
  fullDetailsSpans.forEach(span => span.style.display = (val === "full" ? "inline" : "none"));
}

function setView(val) {
  view = val
  colorsDetailsSpans.forEach(span => span.style.display = (val === "colors" ? "inline" : "none"));
  picturesDetailsSpans.forEach(span => span.style.display = (val === "pictures" ? "inline" : "none"));
};
function switchView() {
  const graph = networks[entity][networkSize].graph;
  if (!renderer) return;
  renderer.setSetting("nodeReducer", (n, attrs) => (view === "pictures" ? attrs : { ...attrs, image: null }));
  renderer.setSetting("labelColor", view === "pictures" ? {attribute: 'color'} : {color: '#999'});
  if (graph && selectedNode && graph.hasNode(selectedNode))
    clickNode(selectedNode, false);
};

// Responsiveness
let resizing = false;
function doResize() {
  resizing = true;
  const graph = networks[entity][networkSize].graph,
    freeHeight = divHeight("sidebar") - divHeight("header") - divHeight("credits") - divHeight("credits-small");
  explanations.style.height = (freeHeight - 15) + "px";
  explanations.style["min-height"] = (freeHeight - 15) + "px";
  nodeDetails.style.height = (freeHeight - 20) + "px";
  nodeDetails.style["min-height"] = (freeHeight - 20) + "px";
  comicsDiv.style.height = divHeight("comics-bar") - divHeight("comics-title") - divHeight("comics-subtitle") - divHeight("comic-details") - 11 + "px";
  const comicsDims = comicsDiv.getBoundingClientRect();
  ["width", "height", "top"].forEach(k =>
    comicsCache.style[k] = comicsDims[k] + "px"
  );
  sigmaDim = Math.min(divHeight("sigma-container"), divWidth("sigma-container"));
  if (renderer && graph && camera) {
    const ratio = Math.pow(1.1, Math.log(camera.ratio) / Math.log(1.5));
    renderer.setSetting("labelRenderedSizeThreshold", ((networkSize === "small" ? 6 : 4) + (entity === "characters" ? 1 : 0)) * sigmaDim/1000);
    graph.forEachNode((node, {stories}) =>
      graph.setNodeAttribute(node, "size", computeNodeSize(node, stories))
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
  setPermalink(target.checked ? "creators" : "characters", networkSize, view, selectedNode);
};
switchNodeFilter.onchange = (event) => {
  const target = event.target as HTMLInputElement;
  setPermalink(entity, target.checked ? "full" : "small", view, selectedNode);
};
switchNodeView.onchange = (event) => {
  const target = event.target as HTMLInputElement;
  setPermalink(entity, networkSize, target.checked ? "colors" : "pictures", selectedNode);
};

function readUrl() {
  let currentUrl = window.location.hash.replace(/^#/, '');
  if (currentUrl === "" || currentUrl.split("/").length < 3)
    currentUrl = "characters/small/pictures";
  let args = currentUrl.split("/");

  let reload = false,
    switchv = false,
    clickn = false;
  if (args[0] !== entity || args[1] !== networkSize)
    reload = true;
  else if (args[2] !== view)
    switchv = true;

  // Setup optional SelectedNode (before setting view which depends on it)
  if (args.length >= 4 && args[3]) {
    selectedNodeLabel = decodeURIComponent(args[3].replace(/\+/g, " "));
    searchInput.value = selectedNodeLabel;
  } else selectedNodeLabel = null;
  const graph = networks[args[0]][args[1]].graph;
  if (graph && args[0] === entity && (
    (selectedNodeLabel && (!selectedNode || (graph.hasNode(selectedNode) && selectedNodeLabel !== graph.getNodeAttribute(selectedNode, "label"))))
    || (!selectedNodeLabel && selectedNode)
  ))
    clickn = true;

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
    camera = null;
    container.innerHTML = '';
    orderSpan.innerHTML = '...';

    // Setup Sidebar default content
    const title = "ap of " + (networkSize === "small" ? "the main" : "most") + " Marvel " + entity + " featured together within same stories";
    document.querySelector("title").innerHTML = "MARVEL networks &mdash; M" + title;
    document.getElementById("title").innerHTML = "This is a m" + title;
    defaultSidebar();
    hideComicsBar();

    if (entity === "creators")
      Object.keys(creatorsRoles).forEach(k => {
        const role = document.getElementById(k + "-color");
        role.style.color = creatorsRoles[k];
        role.innerHTML = k + " (...)";
      });
    else document.querySelectorAll("#clusters-legend .color")
      .forEach(el => el.innerHTML = "...");

    setTimeout(() => {
      // If graph already loaded, just render it
      if (networks[entity][networkSize].graph)
        setTimeout(() => renderNetwork(false), 0);
    // Otherwise load network file
      else
        fetch("./data/Marvel_" + entity + "_by_stories" + (networkSize === "small" ? "" : "_full") + ".json.gz")
          .then((res) => res.arrayBuffer())
          .then((content) => {
            buildNetwork(content);
            renderNetwork(!networks[entity]["full"].graph);
          });
    }, 0);
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
.then((confData) => {
  confData.split("\n").forEach(line => {
    const keyval = line.split(/:\s*/);
    conf[keyval[0]] = keyval[1];
  });

  // Read first url to set settings
  readUrl();
});
