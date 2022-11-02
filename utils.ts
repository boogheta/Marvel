const DEBUG = false;

function logDebug(action, vars = {}) {
  if (DEBUG)
    console.log(" -> " + action, vars);
}
function formatNumber(x) {
  return (x + "")
    .replace(/(.)(.{3})$/, "$1&nbsp;$2");
}

const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function formatMonth(dat) {
  const d = new Date(dat);
  return monthNames[new Date(dat).getMonth()] + " " + dat.slice(0, 4);
}

// Lighten colors function copied from Chris Coyier https://css-tricks.com/snippets/javascript/lighten-darken-color/
function lightenColor(col, amt) {
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
}

export {
  logDebug,
  formatNumber, formatMonth,
  lightenColor,
  meanArray,
  divWidth, divHeight,
  webGLSupport,
  rotatePosition
};
