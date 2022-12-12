const DEBUG = false;

function logDebug(action, vars = {}) {
  if (DEBUG)
    console.log(" -> " + action, vars);
}

function hasClass(element, clss) {
  const classes = new Set(element.className.split(/\s+/));
  return classes.has(clss);
}

function addClass(element, clss) {
  const classes = new Set(element.className.split(/\s+/));
  classes.add(clss);
  element.className = Array.from(classes).join(" ");
}

function rmClass(element, clss) {
  const classes = new Set(element.className.split(/\s+/));
  if (classes.has(clss))
    classes.delete(clss);
  element.className = Array.from(classes).join(" ");
}

function switchClass(element, clss, condition) {
  const classes = new Set(element.className.split(/\s+/));
  if (classes.has(clss))
    classes.delete(clss);
  if (condition)
    classes.add(clss);
  element.className = Array.from(classes).join(" ");
}

function fixImage(url, replacement=null) {
  if (/image_not_available/.test(url)) {
    if (replacement)
      replacement.style.display = "block";
    return '';
  }
  if (replacement)
    replacement.style.display = "none";
  return url.replace(/^http:/, '');
}

function formatNumber(x) {
  return (x + "")
    .replace(/(.)(.{3})$/, '<span class="shifted">$1</span>$2');
}

const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function formatMonth(dat) {
  const d = new Date(dat);
  return monthNames[new Date(dat).getMonth()] + " " + dat.slice(0, 4);
}

// Lighten colors function copied from Chris Coyier https://css-tricks.com/snippets/javascript/lighten-darken-color/
function lightenColor(col, amt=50) {
  var usePound = false;
  if (col[0] === "#") {
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

function meanArray(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function divWidth(divId) {
  return document.getElementById(divId).getBoundingClientRect().width;
}

function divHeight(divId) {
  return document.getElementById(divId).getBoundingClientRect().height;
}

function isTouchDevice() {
  return (('ontouchstart' in window) ||
     (navigator.maxTouchPoints > 0) ||
     (navigator["msMaxTouchPoints"] > 0));
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

function rotatePosition(pos, angle) {
  return {
    x: pos.x * Math.cos(-angle) - pos.y * Math.sin(-angle),
    y: pos.y * Math.cos(-angle) + pos.x * Math.sin(-angle)
  };
};

function useWebWorker(script, inputData, callback) {
  const worker_blob = new Blob([script], { type: "application/javascript" });
  const worker_url = URL.createObjectURL(worker_blob);
  const worker = new Worker(worker_url);
  worker.onmessage = ({ data }) => {
    callback(data);
    worker.terminate();
  };
  worker.postMessage(inputData);
};

function uncompress(compressed, method, callback) {
  useWebWorker(`
    importScripts("${window.location.origin}/pako_inflate.min.js");
    self.onmessage = async (evt) => {
      const file = evt.data;
      const decompressed = pako.${method}(file, {to: "string"});
      self.postMessage(decompressed);
    };
  `, compressed, callback);
};

function buildComicsList(data, callback) {
  useWebWorker(`
    self.onmessage = async (evt) => {
      const data = evt.data;
      const lightenColor = ${lightenColor.toString()};
      const list = data.comics.map(
        x => '<li id="comic-' + x.id + '"' +
          (data.color
            ? ' style="color: ' + lightenColor(data.creatorsRoles[x.role]) + '"'
            : ""
          ) + (data.selectedComic && x.id === data.selectedComic.id
            ? ' class="selected"'
            : ""
          ) + '>' + x.title + '</li>'
      );
      self.postMessage(list);
    };
  `, data, callback);
}

export {
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
};
