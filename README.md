## MARVEL graphs

An app that displays network maps of Marvel characters or creators where each one is positionned close to those he/she is most linked with from within [Marvel's API](https://developer.marvel.com/).

Visit it here: [https://marvel-graphs.net/](https://www.marvel-graphs.net/)

<p align="center">
  <img src="https://github.com/boogheta/Marvel/raw/master/images/screenshot.png" alt="screenshot">
  <img src="https://github.com/boogheta/Marvel/raw/master/images/appshot2.png" alt="appshot">
</p>

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
  npm run aligngraphs
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

Data, comic book images and photographs provided by [Marvel's API](https://developer.marvel.com/). © 2022 Marvel

Here are links to the API's detailed [documentation](https://developer.marvel.com/docs) & [Terms of use](https://developer.marvel.com/terms).

Entirely built with Free Libre Open Source Software and released as such under the [AGPL v3.0 license](./LICENSE).

Icons used or adapted from SVG creations under CC Zero Public Domain by [agomjo](https://openclipart.org/detail/191399/smartphone), CC Attribution License by [boxicons](https://github.com/atisawd/boxicons) and MIT license from [artcoholic](https://github.com/artcoholic/akar-icons) & [Bootstrap](https://github.com/twbs/icons).

Data collection and preparation in Python 3 using [requests](https://requests.readthedocs.io/) and [NetworkX](https://networkx.org/).

Web interface and network visualization in Node.js using [graphology](https://graphology.github.io/), [Sigma.js](https://sigmajs.org/), [pako](http://nodeca.github.io/pako/) and [PapaParse](https://www.papaparse.com/), built in TypeScript with [kotatsu](https://www.npmjs.com/package/kotatsu).

Thanks to [@Yomguithereal](https://github.com/Yomguithereal), [@paulgirard](https://github.com/paulgirard), [@jacomyal](https://github.com/jacomyal) and [@jacomyMa](https://github.com/jacomyMa) for their precious help and ideas!

And lots of thanks to the 2014 Amsterdam [Contropedia](http://contropedia.net/) datasprint where this whole idea germinated before it got buried in my mind and GitHub repositories for 8 long years. :)

[@boogheta](https://twitter.com/boogheta)
