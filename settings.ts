import getNodeProgramImage from "./sigma.js/rendering/webgl/programs/node.image";

const startYear = 1939,
  curYear = (new Date).getFullYear(),
  totalYears = curYear - startYear + 1,
  picturesLoadingDelay = 1500,
  playComicsDelay = 1500,
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
  ],
  sigmaSettings = {
    maxCameraRatio: 75,
    defaultEdgeColor: '#2A2A2A',
    labelFont: 'monospace',
    labelWeight: 'bold',
    labelGridCellSize: 200,
    zoomToSizeRatioFunction: ratio => Math.pow(ratio, 0.75),
    nodeProgramClasses: {
      image: getNodeProgramImage()
    }
  };

export {
  startYear, curYear, totalYears,
  picturesLoadingDelay, playComicsDelay,
  creatorsRoles, clusters,
  extraPalette,
  sigmaSettings
};