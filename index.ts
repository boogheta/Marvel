/* TODO:
- smooth rotate arrows
- update screenshots
- auto data updates
- style comics loader weird on phone?
- tap screen does not work on chrome tablet?
- check why Tiomothy Truman has no comic
- check why zoom on Spiderman 1602 only zooms on regular spiderman
- allow switch selected node other entity highlight corresponding
- add search button with list filter
- plot time evolution of node?
- filter nodes with authors really missing on small
- allow to remove filter on all comics?
- add link actions on creators/characters of comic
- check bad data marvel http://gateway.marvel.com/v1/public/stories/186542/creators incoherent with https://www.marvel.com/comics/issue/84372/damage_control_2022_1
 => scraper comics as counter-truth? :
  - select good creators fields
  - rebuild creators network from cleaned comics instead
  - filter imprint marvel
  - add cover artist in comics list, not in links used
- one more check with takoyaki on authors/characters labels + readjust louvain after
- bind url with selected comic?
IDEAS:
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
  allCharacters = {},
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

const loader = document.getElementById("loader") as HTMLElement,
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
  if ((ent !== entity || siz !== networkSize) && graph && selectedNode) {
    graph.setNodeAttribute(selectedNode, "highlighted", false);
    if (ent !== entity) {
      selectedNode = null;
      selectedNodeLabel = null;
    }
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
}

function hideComicsBar() {
  const clustersLayer = networks[entity][networkSize].clustersLayer;
  comicsCache.style.display = "none";
  comicsBarView = false;
  comicsBar.style.opacity = "0";
  comicsBar.style["z-index"] = "-1";
  modalNext.style.opacity = "0";
  modalPrev.style.opacity = "0";
  unselectComic();
  if (clustersLayer)
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
    x: pos.x * Math.cos(-data.camera.angle) - pos.y * Math.sin(-data.camera.angle),
    y: pos.y * Math.cos(-data.camera.angle) + pos.x * Math.sin(-data.camera.angle)
  };
}*/

function centerNode(node, neighbors = null, force = true) {
  const data = networks[entity][networkSize];

  if (!data.camera || (!node && !neighbors)) return;
  if (!neighbors)
    neighbors = data.graph.neighbors(node);
  if (node && neighbors.indexOf(node) === -1)
    neighbors.push(node);

  const recenter = function(duration) {
    let x0, x1, y0, y1;
    neighbors.forEach(n => {
        const attrs = data.renderer.getNodeDisplayData(n);
        if (!x0 || x0 > attrs.x) x0 = attrs.x;
        if (!x1 || x1 < attrs.x) x1 = attrs.x;
        if (!y0 || y0 > attrs.y) y0 = attrs.y;
        if (!y1 || y1 < attrs.y) y1 = attrs.y;
      });
    const shift = comicsBar.getBoundingClientRect()["x"] && comicsBar.style.opacity !== "0"
      ? divWidth("comics-bar")
      : 0,
      leftCorner = data.renderer.framedGraphToViewport({x: x0, y: y0}),
      rightCorner = data.renderer.framedGraphToViewport({x: x1, y: y1}),
      viewPortPosition = {
        x: (leftCorner.x + rightCorner.x) / 2 ,
        y: (leftCorner.y + rightCorner.y) / 2
      },
      sigmaDims = data.container.getBoundingClientRect();

    // Handle comicsbar hiding part of the graph
    sigmaDims.width -= shift;
    // Evaluate required zoom ratio
    let ratio = Math.min(
      35 / data.camera.ratio,
      Math.max(
        0.21 / data.camera.ratio,
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
      data.camera.animate(
        {
          ...data.renderer.viewportToFramedGraph(viewPortPosition),
          ratio: data.camera.ratio * ratio,
          angle: 0
        },
        {duration: duration}
      );
    }
  }
  if (data.camera.angle) {
    data.camera.animate({angle: 0}, {duration: 75});
    setTimeout(() => recenter(200), 150)
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
  const data = networks[entity][networkSize];
  const comics = (node === null
    ? allComics
    : (entity === "characters"
      ? charactersComics
      : creatorsComics
    )[node]
  );
  if (!node)
    data.camera.animatedReset({ duration: 0 });

  comicsBarView = true;
  comicsBar.style.opacity = "1";
  comicsBar.style["z-index"] = "1";

  comicsCache.style.display = "none";

  const labelNode = (node && data.graph.hasNode(node) ? data.graph.getNodeAttribute(node, "label") : "");
  if (entity === "creators")
    document.getElementById("clusters-layer").style.display = "none";
  if (resetTitle) {
    comicsTitle.innerHTML = "";
    if (comics) {
      comicsTitle.innerHTML = "... comics";
      if (labelNode) comicsTitle.innerHTML += " with<br/>" + labelNode;
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
    const filteredList = (comics ? comics.sort(sortComics === "date" ? sortByDate : sortByTitle) : [])
      .filter(c => (entity === "characters" && c.characters.length) || (entity === "creators" && c.creators.length));
    if (filteredList.length) {
      comicsTitle.innerHTML = fmtNumber(filteredList.length) + " comic" + (filteredList.length > 1 ? "s" : "");
      if (labelNode) comicsTitle.innerHTML += " with<br/>" + labelNode;
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
  const data = networks[entity][networkSize];
  if (!data.graph || !data.renderer) return

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
  const data = networks[entity][networkSize];
  if (!data.graph || !data.renderer) return;

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

  if (comic && selectedNode && data.graph.hasNode(selectedNode))
    data.graph.setNodeAttribute(selectedNode, "highlighted", false)

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
  comicCharacters.innerHTML = comic.characters
    .map(x => allCharacters[x]
      ? '<li id="character-' + x + '">' + allCharacters[x] + "</li>"
      : "")
    .join("");

  data.renderer.setSetting(
    "nodeReducer", (n, attrs) => {
      return comic[entity].indexOf(n) !== -1
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
          };
    }
  );
  data.renderer.setSetting(
    "edgeReducer", (edge, attrs) =>
      comic[entity].indexOf(data.graph.source(edge)) !== -1 && comic[entity].indexOf(data.graph.target(edge)) !== -1
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
    centerNode(null, comic[entity].filter(n => data.graph.hasNode(n)), false);
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
    },
    allowInvalidContainer: true
  };

  (document.querySelectorAll(".sigma-container") as NodeListOf<HTMLElement>).forEach(el => el.style.display = "none");
  const containerId = "sigma-" + entity + "-" + networkSize;
  data.container = document.getElementById(containerId) as HTMLElement;
  data.container.style.display = "block";
  const sigmaDims = data.container.getBoundingClientRect();
  sigmaDim = Math.min(sigmaDims.height, sigmaDims.width);

  if (!data.renderer) {
    data.renderer = new Sigma(data.graph as any, data.container, sigmaSettings);

    // insert the clusters layer underneath the hovers layer
    if (entity === "creators") {
      data.clustersLayer = document.createElement("div");
      data.clustersLayer.id = "clusters-layer";
      data.clustersLayer.style.display = "none";
      data.container.insertBefore(data.clustersLayer, document.querySelectorAll("#" + containerId + " .sigma-hovers")[0]);

      // Clusters labels position needs to be updated on each render
      data.resizeClustersLayer = () => {
        const sigmaDims = document.getElementById(containerId).getBoundingClientRect();
        data.clustersLayer.style.width = sigmaDims.width + "px";

        for (const cluster in data.clusters) {
          const c = data.clusters[cluster];
          const clusterLabel = document.getElementById("community-" + networkSize + "-" + c.id);
          if (!clusterLabel) return;
          // update position from the viewport
          const viewportPos = data.renderer.graphToViewport(c as Coordinates);
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
      data.renderer.on("afterRender", data.resizeClustersLayer);
    }

    // Add pointer on hovering nodes
    data.renderer.on("enterNode", () => data.container.style.cursor = "pointer");
    data.renderer.on("leaveNode", () => data.container.style.cursor = "default");

    // Handle clicks on nodes
    data.renderer.on("clickNode", (event) => clickNode(event.node));
    data.renderer.on("clickStage", () => {
      if (comicsBarView)
        hideComicsBar();
      else setSearchQuery();
    });

    data.camera = data.renderer.getCamera();
  } else {
    data.renderer.setSetting("maxCameraRatio", 100);
    data.renderer.setSetting("labelColor", view === "pictures" ? {attribute: 'hlcolor'} : {color: '#999'});
    data.renderer.setSetting("labelRenderedSizeThreshold", ((networkSize === "small" ? 6 : 4) + (entity === "characters" ? 1 : 0)) * sigmaDim / 1000);

    data.renderer.setSetting(
      "edgeReducer", (edge, attrs) => attrs
    );
    data.renderer.setSetting(
      "labelColor", view === "pictures" ? {attribute: 'hlcolor'} : {color: '#999'}
    );
  }
  data.renderer.setSetting("nodeReducer", (n, attrs) => ({ ...attrs, image: null }));

  // Render clusters labels layer on top of sigma for creators
  if (data.clustersLayer) {
    let clusterLabelsDoms = "";
    for (const cluster in data.clusters) {
      const c = data.clusters[cluster];
      // adapt the position to viewport coordinates
      const viewportPos = data.renderer.graphToViewport(c as Coordinates);
      clusterLabelsDoms += '<div id="community-' + networkSize + "-" + c.id + '" class="cluster-label" style="top: ' + viewportPos.y + 'px; left: ' + viewportPos.x + 'px; color: ' + c.color + '">' + c.label + '</div>';
      data.clustersLayer.innerHTML = clusterLabelsDoms;
    }

  }

  // Bind zoom manipulation buttons
  document.getElementById("zoom-in").onclick = () => {
    data.camera.animatedZoom({ duration: 600 });
  };
  document.getElementById("zoom-out").onclick = () => {
    data.camera.animatedUnzoom({ duration: 600 });
  };
  document.getElementById("zoom-reset").onclick = () => {
    data.camera.animatedReset({ duration: 50 });
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

  // Zoom in graph on init network
  doResize();
  data.camera.x = 0.5;
  data.camera.y = 0.5;
  data.camera.ratio = Math.pow(5, 3);
  data.camera.angle = 0;
  const initLoop = setInterval(() => {
    loader.style.opacity = "0.5";
    document.querySelectorAll("canvas").forEach(canvas => canvas.style.display = "block");
    if (!data.camera) return clearInterval(initLoop);
    if (data.camera.ratio <= 5) {
      if (data.clustersLayer)
        data.clustersLayer.style.display = "block";
      data.renderer.setSetting("maxCameraRatio", 1.3);
      if (comicsBarView && selectedComic && data.camera.ratio <= 25) {
        displayComics(selectedNode, true, true);
        return clearInterval(initLoop);
      }
      const nodeInGraph = selectedNodeLabel ? data.graph.findNode((n, {label}) => label === selectedNodeLabel) : null;
      if (nodeInGraph) {
        clickNode(nodeInGraph, false);
      } else {
        if (selectedNodeLabel)
          clickNode(null);
        data.camera.animate({ratio: 1}, {duration: 100, easing: "linear"});
        setTimeout(() => {
          data.renderer.setSetting("nodeReducer", (n, attrs) => (view === "pictures" ? attrs : { ...attrs, image: null }));
          loader.style.display = "none";
        }, 100);
      }
      selectedNodeLabel = null;
      if (comicsReady === null) {
        comicsReady = false;
        setTimeout(() => {
          loaderComics.style.display = "block";
          fetch("./data/Marvel_comics.csv.gz")
            .then((res) => res.arrayBuffer())
            .then((content) => loadComics(content))
        }, 1000);
      }
      return clearInterval(initLoop);
    }
    data.camera.animate({ratio: data.camera.ratio / 5}, {duration: 100, easing: "linear"});
  }, 150);
}

function addViewComicsButton(node) {
  nodeExtra.innerHTML += '<p id="view-comics"><span>Explore comics</span></p>';
  document.getElementById('view-comics').onclick = () => displayComics(node);
}

function clickNode(node, updateURL = true, center = false) {
  const data = networks[entity][networkSize];
  if (!data.graph || !data.renderer) return;

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
    data.renderer.setSetting(
      "nodeReducer", (n, attrs) => (view === "pictures" ? attrs : { ...attrs, image: null })
    );
    data.renderer.setSetting(
      "edgeReducer", (edge, attrs) => attrs
    );
    data.renderer.setSetting(
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
    data.renderer.setSetting(
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
    data.renderer.setSetting(
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
    data.renderer.setSetting(
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
  const data = networks[entity][networkSize];
  if (!data.graph || !data.renderer)
    return;
  const node = data.graph.nodes()[Math.floor(Math.random() * data.graph.order)];
  clickNode(node, true, true);
}

// Fullscreen button
const win = document.documentElement as any,
  fullScreenBtn = document.getElementById("fullscreen") as HTMLButtonElement,
  regScreenBtn = document.getElementById("regscreen") as HTMLButtonElement;
fullScreenBtn.onclick = () => {
  const data = networks[entity][networkSize];
  const cameraState = {...data.camera};
  if (win.requestFullscreen) {
    win.requestFullscreen();
  } else if (win.webkitRequestFullscreen) { /* Safari */
    win.webkitRequestFullscreen();
  } else if (win.msRequestFullscreen) { /* IE11 */
    win.msRequestFullscreen();
  }
  data.camera.animate(cameraState, {duration: 100});
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
  const data = networks[entity][networkSize];
  if (!data.renderer) return;
  loader.style.display = "block";
  loader.style.opacity = "0.5";

  setTimeout(() => {
    data.renderer.setSetting("nodeReducer", (n, attrs) => (view === "pictures" ? attrs : { ...attrs, image: null }));
    data.renderer.setSetting("labelColor", view === "pictures" ? {attribute: 'hlcolor'} : {color: '#999'});
    if (data.graph && comicsBarView && selectedComic)
      selectComic(selectedComic, true, true);
    else if (data.graph && selectedNode && data.graph.hasNode(selectedNode))
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
  const data = entity ? networks[entity][networkSize] : null,
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
  const sigmaDims = (data && data.container ? data.container : document.querySelector(".sigma-container")).getBoundingClientRect();
  sigmaDim = Math.min(sigmaDims.height, sigmaDims.width);
  if (!fast && data && data.renderer && data.graph && data.camera) {
    const ratio = Math.pow(1.1, Math.log(data.camera.ratio) / Math.log(1.5));
    data.renderer.setSetting("labelRenderedSizeThreshold", ((networkSize === "small" ? 6 : 4) + (entity === "characters" ? 1 : 0)) * sigmaDim / 1000);
    data.graph.forEachNode((node, {stories}) =>
      data.graph.setNodeAttribute(node, "size", computeNodeSize(node, stories))
    );
    if (data.resizeClustersLayer)
      data.resizeClustersLayer();
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
  const data = networks[args[0]][args[1]];
  if (data.graph && args[0] === entity && (
    (selectedNodeLabel && (!selectedNode || (data.graph.hasNode(selectedNode) && selectedNodeLabel !== data.graph.getNodeAttribute(selectedNode, "label"))))
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
    if (data.clustersLayer) {
      data.clustersLayer.innerHTML = "";
      data.clustersLayer.style.display = "none";
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
            setTimeout(renderNetwork, 10);
          });
      }
    }, 10);
  } else if (switchv)
    switchView();
  else if (clickn)
    clickNode(data.graph.findNode((n, {label}) => label === selectedNodeLabel), false);
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
