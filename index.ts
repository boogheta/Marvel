/* TODO:
- do not reload full ist of comics when switching from comics/characters
- test new sigma size ratio from jacomyal
- try to set type=circle instead of image=null ?
- mobiles bugs
  - comicslist min height
  - test centernode after rotate with no framedgraph
  - auto fullscreen?
- allow to switch from selected node to other entity and highlight corresponding
- add link actions on creators/characters of comic
- add search button with list filter
- check bad data marvel :
  - http://gateway.marvel.com/v1/public/stories/186542/creators incoherent with https://www.marvel.com/comics/issue/84372/damage_control_2022_1
  - check why Tiomothy Truman has no comic
  - check why zoom on Spiderman 1602 only zooms on regular spiderman
  - test new spatialization graphology
 => scraper comics as counter-truth? :
  - select good creators fields
  - rebuild creators network from cleaned comics instead
  - filter imprint marvel
  - add cover artist in comics list, not in links used
 => one more check with takoyaki on authors/characters labels + readjust louvain after
- update screenshots
- bind url with selected comic?
- auto data updates
IDEAS:
- plot time evolution of node?
- install app button?
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
  sigmaDim = null,
  renderer = null,
  camera = null,
  clustersLayer = null,
  resizeClusterLabels = function() {},
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
  allComics = [],
  allCharacters = {"-1": "missing info"},
  allCreators = {"-1": "missing info"},
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
const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function formatMonth(dat) {
  const d = new Date(dat);
  return monthNames[new Date(dat).getMonth()] + " " + dat.slice(0, 4);
}

function webGLSupport() {
  try {
   var canvas = document.createElement('canvas');
   return !!window.WebGLRenderingContext &&
     (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch(e) {
    return false;
  }
};

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
  smallDetailsSpans = document.querySelectorAll(".small-details") as NodeListOf<HTMLElement>,
  fullDetailsSpans = document.querySelectorAll(".full-details") as NodeListOf<HTMLElement>;

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
  if ((ent !== entity || siz !== networkSize)) {
    hideCanvases();
    if (selectedNode) {
      if (graph && graph.hasNode(selectedNode))
        graph.setNodeAttribute(selectedNode, "highlighted", false);
      if (ent !== entity) {
        selectedNode = null;
        selectedNodeLabel = null;
      }
    }
  }
  window.location.hash = ent + "/" + siz + "/" + vie + selection;
}

function hideCanvases() {
  (document.querySelectorAll(".sigma-container canvas") as NodeListOf<HTMLElement>).forEach(canvas => canvas.style.display = "none");
  if (clustersLayer)
    clustersLayer.style.display = "none";
}
function showCanvases(showClustersLayer = true) {
  (document.querySelectorAll(".sigma-container canvas") as NodeListOf<HTMLElement>).forEach(canvas => canvas.style.display = "block");
  if (showClustersLayer && clustersLayer && entity === "creators")
    clustersLayer.style.display = "block";
}

function defaultSidebar() {
  explanations.style.display = "block";
  explanations.scrollTo(0, 0);
  nodeDetails.style.display = "none";
  nodeDetails.scrollTo(0, 0);
  modal.style.display = "none";
  modalImg.src = "";
}

function hideComicsBar() {
  comicsCache.style.display = "none";
  comicsBarView = false;
  comicsBar.style.opacity = "0";
  comicsBar.style["z-index"] = "-1";
  modalNext.style.opacity = "0";
  modalPrev.style.opacity = "0";
  unselectComic();
  if (entity === "creators" && clustersLayer)
    clustersLayer.style.display = "block";
}
document.getElementById("close-bar").onclick = hideComicsBar;

function computeNodeSize(node, stories) {
  return Math.pow(stories, 0.2)
    * (entity === "characters" ? 1.75 : 1.25)
    * (networkSize === "small" ? 1.75 : 1.25)
    * sigmaDim / 1000
};

/*function rotatePosition(pos) {
  return {
    x: pos.x * Math.cos(-camera.angle) - pos.y * Math.sin(-camera.angle),
    y: pos.y * Math.cos(-camera.angle) + pos.x * Math.sin(-camera.angle)
  };
}*/

function centerNode(node, neighbors = null, force = true) {
  const data = networks[entity][networkSize];

  if (!camera || (!node && !neighbors)) return;
  if (!neighbors)
    neighbors = data.graph.neighbors(node);
  else if (!neighbors.length)
    neighbors = data.graph.nodes();
  if (node && neighbors.indexOf(node) === -1)
    neighbors.push(node);

  const recenter = function(duration) {
    let x0, x1, y0, y1;
    neighbors.forEach(n => {
        const attrs = renderer.getNodeDisplayData(n);
        if (!x0 || x0 > attrs.x) x0 = attrs.x;
        if (!x1 || x1 < attrs.x) x1 = attrs.x;
        if (!y0 || y0 > attrs.y) y0 = attrs.y;
        if (!y1 || y1 < attrs.y) y1 = attrs.y;
      });
    const shift = comicsBar.getBoundingClientRect()["x"] && comicsBar.style.opacity !== "0"
      ? divWidth("comics-bar")
      : 0,
      leftCorner = renderer.framedGraphToViewport({x: x0, y: y0}),
      rightCorner = renderer.framedGraphToViewport({x: x1, y: y1}),
      viewPortPosition = {
        x: (leftCorner.x + rightCorner.x) / 2 ,
        y: (leftCorner.y + rightCorner.y) / 2
      },
      sigmaDims = container.getBoundingClientRect();

    // Handle comicsbar hiding part of the graph
    sigmaDims.width -= shift;
    // Evaluate required zoom ratio
    let ratio = Math.min(
      35 / camera.ratio,
      Math.max(
        0.21 / camera.ratio,
        1.3 / Math.min(
          sigmaDims.width / (rightCorner.x - leftCorner.x),
          sigmaDims.height / (leftCorner.y - rightCorner.y)
        )
      )
    );

    // Evaluate acceptable window
    const xMin = 15 * sigmaDims.width / 100,
      xMax = 85 * sigmaDims.width / 100,
      yMin = 15 * sigmaDims.height / 100,
      yMax = 85 * sigmaDims.height / 100;

    // Zoom on node only if force, if more than 2 neighbors and outside acceptable window or nodes quite close together, or if outside full window or nodes really close together
    if (force ||
      leftCorner.x < 0 || rightCorner.y < 0 || rightCorner.x > sigmaDims.width || leftCorner.y > sigmaDims.height ||
      (ratio !== 0 && (ratio < 0.35)) ||
      (neighbors.length > 2 && (leftCorner.x < xMin || rightCorner.y < yMin || rightCorner.x > xMax || leftCorner.y > yMax))
    ) {
      viewPortPosition.x += ratio * shift / 2;
      camera.animate(
        {
          ...renderer.viewportToFramedGraph(viewPortPosition),
          ratio: camera.ratio * ratio,
          angle: 0
        },
        {duration: duration}
      );
    }
  }
  if (camera.angle) {
    camera.animate({angle: 0}, {duration: 100});
    setTimeout(() => recenter(250), 100)
  } else recenter(350);
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

	},
	complete: function() {
      comicsReady = true;
      loaderComics.style.display = "none";
      viewAllComicsButton.style.display = "block";
      if (selectedNode)
        addViewComicsButton(selectedNode);
      preloadOtherNetworks();
    }
  });
}

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

function displayComics(node, autoReselect = false, resetTitle = true) {
  const graph = networks[entity][networkSize].graph;
  const comics = (node === null
    ? allComics
    : (entity === "characters"
      ? charactersComics
      : creatorsComics
    )[node]
  );

  comicsBarView = true;
  comicsBar.style.opacity = "1";
  comicsBar.style["z-index"] = "1";

  comicsCache.style.display = "none";

  const labelNode = (node && graph.hasNode(node) ? graph.getNodeAttribute(node, "label") : "");
  if (entity === "creators")
    document.getElementById("clusters-layer").style.display = "none";
  if (resetTitle) {
    comicsTitle.innerHTML = "";
    if (comics) {
      comicsTitle.innerHTML = "... comics";
      if (labelNode) comicsTitle.innerHTML += " " + (entity === "creators" ? "by" : "with") + <br/>" + labelNode;
    }
    comicsSubtitleList.innerHTML = "";
  }
  comicsSubtitle.style.display = (entity === "creators" && selectedNode ? "inline" : "none");

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
    const filteredList = (comics ? comics.sort(sortComics === "date" ? sortByDate : sortByTitle) : []);
      //.filter(c => (entity === "characters" && c.characters.length) || (entity === "creators" && c.creators.length));
    if (filteredList.length) {
      comicsTitle.innerHTML = fmtNumber(filteredList.length) + " comic" + (filteredList.length > 1 ? "s" : "");
      if (labelNode) comicsTitle.innerHTML += " " + (entity === "creators" ? "by" : "with") + "<br/>" + labelNode;
      if (labelNode && entity === "creators")
        comicsSubtitleList.innerHTML = Object.keys(creatorsRoles)
          .map(x => '<span style="color: ' + lighten(creatorsRoles[x], 50) + '">' + x + '</span>')
          .join("&nbsp;")
          .replace(/&nbsp;([^&]+)$/, " or $1");
    }
    setTimeout(() => {
      comicsList.innerHTML = filteredList
        ? filteredList.map(x => '<li id="comic-' + x.id + '"' + (labelNode && entity === "creators" ? ' style="color: ' + lighten(creatorsRoles[x.role], 50) + '"' : "") + (selectedComic && x.id === selectedComic.id ? ' class="selected"' : "") + '>' + x.title + "</li>")
          .join("")
        : "No comic-book found.";
      if (filteredList.length) filteredList.forEach(c => {
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
      doResize(true);
    }, 200);
  }, 200);
}
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
  playing = setInterval(() => selectAndScrollSibling("next"), 1500);
}
function stopPlayComics() {
  comicsPause.style.display = "none";
  comicsPlay.style.display = "inline-block";
  modalPause.style.display = "none";
  modalPlay.style.display = "inline-block";
  if (playing) clearInterval(playing);
  playing = false;
}
comicsPlay.onclick = playComics;
comicsPause.onclick = stopPlayComics;
comicsPrev.onclick = () => selectAndScrollSibling("previous", true);
comicsNext.onclick = () => selectAndScrollSibling("next", true);

comicsList.onmouseleave = () => {
  if (selectedComic)
    selectComic(selectedComic);
  else unselectComic();
};

viewAllComicsButton.onclick = () => displayComics(null);

// Esc & Arrow keys handling on comics list
document.onkeydown = function(e) {
  const graph = networks[entity][networkSize].graph;
  if (!graph || !renderer) return

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
      clickNode(null, true);
    else return;
  } else return;
  e.preventDefault(); // prevent the default action (scroll / move caret)
};

// Handle swipes
let touches = {x: [0, 0], y: [0, 0]};
function touchStart(e) {
  touches.x[0] = e.changedTouches[0].screenX;
  touches.y[0] = e.changedTouches[0].screenY;
};
modal.ontouchstart = touchStart;
comicImg.ontouchstart = modal.ontouchstart;
switchTypeLabel.ontouchstart = modal.ontouchstart;
switchViewLabel.ontouchstart = modal.ontouchstart;
switchFilterLabel.ontouchstart = modal.ontouchstart;
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
  // Vertical or no difference dominates
  else if (verticalDifference >= threshold)
    return "up";
  else if (verticalDifference <= -threshold)
    return "down";
  }
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
    setPermalink(switchNodeType.checked ? "creators" : "characters", networkSize, view, selectedNode);
  }
};
switchFilterLabel.ontouchend = e => {
  const typ = touchEnd(e, 20);
  if (typ === "left" || typ === "right") {
    switchNodeFilter.checked = !switchNodeFilter.checked;
   setPermalink(entity, switchNodeFilter.checked ? "full" : "small", view, selectedNode);
  }
};
switchViewLabel.ontouchend = e => {
  const typ = touchEnd(e, 0);
  if (typ === "left" || typ === "right") {
    switchNodeView.checked = !switchNodeView.checked;
    setPermalink(entity, networkSize, switchNodeView.checked ? "colors" : "pictures", selectedNode);
  }
};

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

function unselectComic() {
  const graph = networks[entity][networkSize].graph;
  hoveredComic = null;
  selectedComic = null;
  selectComic(null, true);
  clickNode(selectedNode, false);
  if (selectedNode && graph.hasNode(selectedNode)) {
    setTimeout(() => centerNode(selectedNode), 50);
  }
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
      ? '<li id="creator-' + x + '" title="writer" style="color: ' + lighten(creatorsRoles["writer"], 50) + '">' + allCreators[x] + "</li>"
      : "")
    .join("");
  comicCreators.innerHTML += (comic.artists.length ? comic.artists : ["-1"])
    .map(x => allCreators[x]
      ? '<li id="creator-' + x + '" title="artist" style="color: ' + lighten(creatorsRoles["artist"], 50) + '">' + allCreators[x] + "</li>"
      : "")
    .join("");
  comicCharacters.innerHTML = (comic.characters.length ? comic.characters : ["-1"])
    .map(x => allCharacters[x]
      ? '<li id="character-' + x + '">' + allCharacters[x] + "</li>"
      : "")
    .join("");

  renderer.setSetting(
    "nodeReducer", (n, attrs) => comic[entity].indexOf(n) !== -1
      ? { ...attrs,
          zIndex: 2,
          size: attrs.size * 1.75,
          image: view === "pictures" ? attrs.image : null
        }
      : { ...attrs,
          zIndex: 0,
          color: "#2A2A2A",
          image: null,
          size: sigmaDim / 350,
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

  setTimeout(() => {
    centerNode(null, comic[entity].filter(n => graph.hasNode(n)), false);
    loader.style.display = "none";
    loader.style.opacity = "0";
  }, 50);
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
      type: "thumbnail",
      image: /available/i.test(image) ? "" : image,
      size: computeNodeSize(node, stories),
      color: color,
      hlcolor: lighten(color, 35)
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
  networksLoaded += 1;
  if (networksLoaded === 4)
    loaderComics.style.display = "none";
  else if (comicsReady)
    preloadOtherNetworks();
}

function renderNetwork() {
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
    minCameraRatio: (entity === "creators" && networkSize === "full" ? 0.035 : 0.07),
    maxCameraRatio: 100,
    defaultEdgeColor: '#2A2A2A',
    labelWeight: 'bold',
    labelFont: 'monospace',
    labelColor: view === "pictures" ? {attribute: 'hlcolor'} : {color: '#999'},
    labelGridCellSize: 180,
    labelRenderedSizeThreshold: ((networkSize === "small" ? 6 : 4) + (entity === "characters" ? 1 : 0)) * sigmaDim / 1000,
    nodesSizeZoomAdjuster: ratio => Math.pow(ratio, 0.75),
    nodeProgramClasses: {
      thumbnail: getNodeProgramImage()
    }
  };

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
  } else {
    renderer.setSetting("maxCameraRatio", 100);
    renderer.setSetting("labelColor", view === "pictures" ? {attribute: 'hlcolor'} : {color: '#999'});
    renderer.setSetting("labelRenderedSizeThreshold", ((networkSize === "small" ? 6 : 4) + (entity === "characters" ? 1 : 0)) * sigmaDim / 1000);

    renderer.setSetting("edgeReducer", (edge, attrs) => attrs);
    renderer.setSetting(
      "labelColor", view === "pictures" ? {attribute: 'hlcolor'} : {color: '#999'}
    );

    renderer.setGraph(data.graph);
  }
  renderer.setSetting("nodeReducer", (n, attrs) => ({ ...attrs, image: null }));

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

  // Bind zoom manipulation buttons
  camera = renderer.getCamera();
(window as any).camera = data.camera;
  document.getElementById("zoom-in").onclick = () => {
    camera.animatedZoom({ duration: 600 });
  };
  document.getElementById("zoom-out").onclick = () => {
    camera.animatedUnzoom({ duration: 600 });
  };
  document.getElementById("zoom-reset").onclick = () => {
    camera.animatedReset({ duration: 250 });
  };

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
    setTimeout(() => centerNode(selectedNode), 50);
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
        clickNode(suggestionsMatch[0].node);
        // Move the camera to center it on the selected node and its neighbors:
        setTimeout(() => centerNode(selectedNode), 50);
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

  // Init view
  if (view === "colors")
    switchView();

  function initGraph(data, loop = null) {
    renderer.setSetting("maxCameraRatio", 1.3);

    // If a comic is selected we reload the list with it within it
    if (comicsBarView && selectedComic && camera.ratio <= 2.25) {
      showCanvases();
      data.rendered = true;
      displayComics(selectedNode, true, true);
      return loop ? clearInterval(loop) : null;
    }

    // If a node is selected we refocus it
    const nodeInGraph = selectedNodeLabel ? data.graph.findNode((n, {label}) => label === selectedNodeLabel) : null;
    if (nodeInGraph) {
      showCanvases();
      clickNode(nodeInGraph, false);
    } else {
      if (selectedNodeLabel)
        clickNode(null);
      camera.animatedReset({ duration: 0 });
      setTimeout(() => {
        showCanvases();
        renderer.setSetting("nodeReducer", (n, attrs) => (view === "pictures" ? attrs : { ...attrs, image: null }));
        loader.style.display = "none";
      }, 50);
    }
    data.rendered = true;
    selectedNodeLabel = null;

    // Load comics data after first network rendered
    if (loop && comicsReady === null) {
      comicsReady = false;
      loaderComics.style.display = "block";
      setTimeout(() => {
        fetch("./data/Marvel_comics.csv.gz")
          .then((res) => res.arrayBuffer())
          .then((content) => loadComics(content))
      }, 2000);
    }
    return loop ? clearInterval(loop) : null;
  }

  loader.style.opacity = "0.5";
  doResize();
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
        return initGraph(data, initLoop)
      camera.animate({ratio: camera.ratio / 1.5}, {duration: 50, easing: "linear"});
    }, 50);
  } else initGraph(data);
}

function addViewComicsButton(node) {
  nodeExtra.innerHTML += '<p id="view-comics"><span>Explore comics</span></p>';
  document.getElementById('view-comics').onclick = () => displayComics(node);
}

function clickNode(node, updateURL = true, center = false) {
  const data = networks[entity][networkSize];
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
    selectedNodeLabel = null;
    if (updateURL)
      setPermalink(entity, networkSize, view, node);
    selectSuggestions.selectedIndex = 0;
    defaultSidebar();
    renderer.setSetting(
      "nodeReducer", (n, attrs) => (view === "pictures" ? attrs : { ...attrs, image: null })
    );
    renderer.setSetting(
      "edgeReducer", (edge, attrs) => attrs
    );
    renderer.setSetting(
      "labelColor", view === "pictures" ? {attribute: 'hlcolor'} : {color: '#999'}
    );
    return;
  }

  selectedNode = node;
  if (updateURL && !sameNode)
    setPermalink(entity, networkSize, view, node);

  // Fill sidebar with selected node's details
  const attrs = data.graph.getNodeAttributes(node);
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

  // Highlight clicked node and make it bigger always with a picture and hide unconnected ones
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
  if (!comicsBarView || ! selectedComic) {
    data.graph.setNodeAttribute(node, "highlighted", true);
    renderer.setSetting(
      "nodeReducer", (n, attrs) => {
        return n === node
          ? { ...attrs,
              zIndex: 2,
              size: attrs.size * 1.75,
              hlcolor: "#ec1d24"
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
              size: Math.max(0.5, Math.log(data.graph.getEdgeAttribute(edge, 'weight') * sigmaDim / 300000))
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
  }
  if (comicsBarView && !sameNode)
    displayComics(node, true);
  else if (!updateURL || center)
    setTimeout(() => {
      centerNode(node);
      loader.style.display = "none";
      loader.style.opacity = "0";
    }, 50);
  else {
    loader.style.display = "none";
    loader.style.opacity = "0";
  }
  if (!sameNode)
    comicsDiv.scrollTo(0, 0);
};

// Click a random node button
document.getElementById("view-node").onclick = () => {
  const graph = networks[entity][networkSize].graph;
  if (!graph || !renderer)
    return;
  const node = graph.nodes()[Math.floor(Math.random() * graph.order)];
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
function setEntity(val) {
  entity = val;
  entitySpans.forEach(span => span.innerHTML = val);
  charactersDetailsSpans.forEach(span => span.style.display = (val === "characters" ? "inline-block" : "none"));
  creatorsDetailsSpans.forEach(span => span.style.display = (val === "creators" ? "inline-block" : "none"));
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
  loader.style.display = "block";
  loader.style.opacity = "0.5";

  setTimeout(() => {
    renderer.setSetting("nodeReducer", (n, attrs) => (view === "pictures" ? attrs : { ...attrs, image: null }));
    renderer.setSetting("labelColor", view === "pictures" ? {attribute: 'hlcolor'} : {color: '#999'});
    if (graph && comicsBarView && selectedComic)
      selectComic(selectedComic, true, true);
    else if (graph && selectedNode && graph.hasNode(selectedNode))
      clickNode(selectedNode);
    else {
      loader.style.display = "none";
      loader.style.opacity = "0";
    }
  }, 10);
};

// Responsiveness
let resizing = undefined;
function doResize(fast = false) {
console.log("now");
  if (!fast) resizing = true;
  const graph = entity ? networks[entity][networkSize].graph : null,
    freeHeight = divHeight("sidebar") - divHeight("header") - divHeight("credits") - divHeight("credits-small") - 10;
  explanations.style.opacity = "1"
  explanations.style.height = freeHeight + "px";
  explanations.style["min-height"] = freeHeight + "px";
  nodeDetails.style.height = freeHeight + "px";
  nodeDetails.style["min-height"] = freeHeight + "px";
  comicsDiv.style.height = divHeight("comics-bar") - divHeight("comics-header") - divHeight("comic-details") - 11 + "px";
  const comicsDims = comicsDiv.getBoundingClientRect();
  ["width", "height", "top"].forEach(k =>
    comicsCache.style[k] = comicsDims[k] + "px"
  );
  const sigmaDims = container.getBoundingClientRect();
  sigmaDim = Math.min(sigmaDims.height, sigmaDims.width);
  if (!fast && renderer && graph && camera) {
    const ratio = Math.pow(1.1, Math.log(camera.ratio) / Math.log(1.5));
    renderer.setSetting("labelRenderedSizeThreshold", ((networkSize === "small" ? 6 : 4) + (entity === "characters" ? 1 : 0)) * sigmaDim / 1000);
    graph.forEachNode((node, {stories}) =>
      graph.setNodeAttribute(node, "size", computeNodeSize(node, stories))
    );
  }
  if (!fast) resizing = false;
}
function resize() {
  if (resizing === true) return;
  if (resizing) clearTimeout(resizing);
  resizing = setTimeout(doResize, 0);
};
window.onresize = resize;

switchNodeType.onchange = (event) => {
  const target = event.target as HTMLInputElement;
  explanations.style.opacity = "0";
  setPermalink(target.checked ? "creators" : "characters", networkSize, view, selectedNode);
};
switchNodeFilter.onchange = (event) => {
  const target = event.target as HTMLInputElement;
  explanations.style.opacity = "0";
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
  if (args[0] !== entity)
    defaultSidebar()
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

  if (!webGLSupport()) {
    document.getElementById("webgl-disclaimer").style.display = "block";
    return;
  }

  if (reload) {
    loader.style.transform = (comicsBarView && comicsBar.getBoundingClientRect().x !== 0 ? "translateX(-" + divWidth("comics-bar") / 2 + "px)" : "");
    loader.style.opacity = "1";
    loader.style.display = "block";

    orderSpan.innerHTML = '...';
    if (clustersLayer) {
      clustersLayer.innerHTML = "";
      clustersLayer.style.display = "none";
    }

    // Setup Sidebar default content
    const title = "ap of Marvel's " + (networkSize === "small" ? "main" : "most") + " " + entity + " featured together within same stories";
    document.querySelector("title").innerHTML = "MARVEL-graphs.net &mdash; M" + title;
    document.getElementById("title").innerHTML = "Here is a m" + title;

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
        renderNetwork();
    // Otherwise load network file
      else {
        networks[entity][networkSize].loading = true;
        fetch("./data/Marvel_" + entity + "_by_stories" + (networkSize === "small" ? "" : "_full") + ".json.gz")
          .then((res) => res.arrayBuffer())
          .then((content) => {
            buildNetwork(content, entity, networkSize);
            setTimeout(renderNetwork, 0);
          });
      }
    }, 0);
  } else if (switchv)
    switchView();
  else if (clickn)
    clickNode(graph.findNode((n, {label}) => label === selectedNodeLabel), false);
}
window.onhashchange = readUrl;

function preloadOtherNetworks() {
  ["creators", "characters"].forEach(e =>
    ["small", "full"].forEach(s => {
      if (!networks[e][s].loading) {
        networks[e][s].loading = true;
        loaderComics.style.display = "block";
        return fetch("./data/Marvel_" + e + "_by_stories" + (s === "small" ? "" : "_full") + ".json.gz")
          .then(res => res.arrayBuffer())
          .then(content => buildNetwork(content, e, s));
      }
    })
  );
}

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
