## MARVEL networks

An app that displays maps of Marvel characters or creators where each one is positionned close to those he/she is most linked with from within [Marvel's API](https://developer.marvel.com/).

Visit it here: [https://boogheta.github.io/Marvel/](https://boogheta.github.io/Marvel/)

<img src="https://raw.githubusercontent.com/boogheta/Marvel/master/images/screenshot.png" alt="screenshot">
<img src="https://raw.githubusercontent.com/boogheta/Marvel/master/images/appshot.png" alt="appshot">

### Installation

- Build the data

  ```bash
  pip install -r requirements.txt
  cp config.yml{.example,}
  # set API key from http://developer.marvel.com/signup
  python bin/download_data.py
  ```

- Prespatialize and run Louvain on graphs

  ```bash
  npm install
  npm run preparegraphs
  ```

- Run web interface

  ```bash
  npm install
  # To start locally on http://localhost:3000
  npm start
  # Or to build prod
  npm run build
  ```

### Credits

Data provided by [Marvel's API](https://developer.marvel.com/). © 2022 Marvel

API documentation: https://developer.marvel.com/docs

Entirely built with Free Libre Open Source Software and released as such under the [AGPL v3.0 license](./LICENSE).

Data collection and preparation in Python 3 using [requests](https://requests.readthedocs.io/) and [NetworkX](https://networkx.org/).

Web interface and network visualization in Node.js using [graphology](https://graphology.github.io/), [Sigma.js](https://sigmajs.org/) and [pako](http://nodeca.github.io/pako/), built in TypeScript with [kotatsu](https://www.npmjs.com/package/kotatsu).

Thanks to [@Yomguithereal](https://github.com/Yomguithereal), [@paulgirard](https://github.com/paulgirard), [@jacomyal](https://github.com/jacomyal) and [@jacomyMa](https://github.com/jacomyMa) for their precious help and ideas!

And lots of thanks to the 2014 Amsterdam [Contropedia](http://contropedia.net/) datasprint where this whole idea germinated before it got buried in my mind and GitHub repositories for 8 long years. :)

[@boogheta](https://twitter.com/boogheta)
