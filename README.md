## MARVEL networks

### Build the data

```bash
pip install -r requirements.txt
cp config.yml{.example,}
# set API key from http://developer.marvel.com/signup
python bin/download_data.py
```

### Run web interface

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

