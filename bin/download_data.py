#!/usr/bin env python

import os
import sys
import csv
import json
import yaml
import shutil
import requests
from time import time, sleep
from hashlib import md5
import networkx as nx

def retry_get(url, stream=False, retries=5):
    try:
        res = requests.get(url, stream=stream)
        assert(res.status_code == 200)
        return res
    except (ConnectionResetError, AssertionError, requests.exceptions.ConnectionError) as e:
        if retries:
            print("...call failed, will retry in a few seconds...")
            sleep(15 - 2 * retries)
            return retry_get(url, stream=stream, retries=retries-1)
        print("Error with url " + url, res)
        print("%s: %s" % (type(e), e))
        sys.exit(1)

def cache_download(url, cache_file):
    if "--ignore-cache" not in sys.argv and os.path.exists(cache_file):
        try:
            with open(cache_file) as f:
                return json.load(f)
        except Exception as e:
            print("ERROR while loading cache file for", url, cache_file, e, file=sys.sderr)
            raise e

    print("Calling " + url)
    res = retry_get(url)
    data = res.json()
    with open(cache_file, "w") as f:
        json.dump(data, f)
    return data

CONF = None
def auth():
    global CONF
    if not CONF:
        with open("config.yml") as f:
            CONF = yaml.load(f, Loader=yaml.FullLoader)
    ts = str(time())
    hashmd5 = md5((ts + CONF["api_secret"] + CONF["api_key"]).encode('utf-8')).hexdigest()
    return "ts={}&apikey={}&hash={}".format(ts, CONF["api_key"], hashmd5)

def complete_data(data):
    for item in data["data"]["results"]:
        for key in ["creators", "characters"]:
            if item[key]["available"] != item[key]["returned"]:
                print("COMPLETING " + str(item["id"]))
                known = set(obj["resourceURI"] for obj in item[key]["items"])
                page = 0
                while item[key]["returned"] < item[key]["available"]:
                    res = process_api_page("comics/%s/%s" % (item["id"], key), page=page)
                    for obj in res["data"]["results"]:
                        if obj["resourceURI"] in known:
                            continue
                        known.add(obj["resourceURI"])
                        item[key]["returned"] += 1
                        item[key]["items"].append({
                            "resourceURI": obj["resourceURI"],
                            "name": obj.get("name", obj.get("fullName"))
                        })
                    page += 1
    return data

def download_thumbnails(entity, data):
    for item in data["data"]["results"]:
        if item.get("image") and os.path.exists(item["image"]):
            continue
        if "image_not_available" in item["thumbnail"]["path"]:
            item["image"] = "./images/not_available.gif"
            continue
        thumbnail_url = item["thumbnail"]["path"] + "/standard_medium." + item["thumbnail"]["extension"]
        thumbnail_file = os.path.join("images", entity, "%s.%s" % (item["id"], item["thumbnail"]["extension"]))
        if not os.path.exists(thumbnail_file):
            print("Downloading image for " + item.get("name", item.get("fullName")) + " at " + thumbnail_url)
            res = retry_get(thumbnail_url, stream=True)
            if res.status_code == 200:
                with open(thumbnail_file, 'wb') as img_file:
                    shutil.copyfileobj(res.raw, img_file)
            else:
                item["image"] = "./images/not_available.gif"
        item["image"] = "./" + thumbnail_file
    return data

def process_api_page(entity, args={}, filters={}, page=0):
    url_args = {
        "entity": entity,
        "query_args": "&".join("%s=%s" % (k, "%2C".join(v) if type(v) == list else v) for k, v in args.items()).replace(" ", "%20"),
        "auth": auth(),
        "offset": 100 * page
    }
    url = "https://gateway.marvel.com:443/v1/public/{entity}?{auth}&{query_args}&limit=100&offset={offset}".format(**url_args)

    if "/" in entity:
        cache_file = os.path.join(".cache", "extra", "{}_{:05d}.json".format(entity.replace("/", "_"), page))
    else:
        cache_file = os.path.join(".cache", entity, "{}_{:05d}.json".format(url_args["query_args"].replace("&", "_"), page))

    data = cache_download(url, cache_file)
    if entity == "comics":
        data = complete_data(data)
    elif entity in ["creators", "characters"]:
        data = download_thumbnails(entity, data)
    with open(cache_file, "w") as f:
        json.dump(data, f)
    for filter_key, filter_value in filters.items():
        data["data"]["results"] = [r for r in data["data"]["results"] if (type(filter_value) == list and r[filter_key] in filter_value) or r[filter_key] == filter_value]
    return data

def download_entity(entity, options, filters={}):
    if not os.path.exists(".cache"):
        os.makedirs(".cache")
    if not os.path.exists("images"):
        os.makedirs("images")
    extra_dir = os.path.join(".cache", "extra")
    if not os.path.exists(extra_dir):
        os.makedirs(extra_dir)
    entity_dir = os.path.join(".cache", entity)
    if not os.path.exists(entity_dir):
        os.makedirs(entity_dir)
    if entity != "comics":
        entity_img_dir = os.path.join("images", entity)
        if not os.path.exists(entity_img_dir):
            os.makedirs(entity_img_dir)

    first_results = process_api_page(entity, options, filters=filters)
    total_results = first_results["data"]["total"]
    entities = first_results["data"]["results"]
    page = 1
    while 100 * page < total_results:
        results = process_api_page(entity, options, filters=filters, page=page)
        entities += results["data"]["results"]
        page += 1
    return entities

extractID = lambda n: int(n["id"] if "id" in n else n["resourceURI"].split("/")[-1])

# Duplicates and bad names from creators data curated with the help of Takoyaki <https://yomguithereal.github.io/takoyaki/>
SKIPNAMES = ["Various", "Blank", "Virtual", "#X", "ART & COMICS INT", "METROPOLIS", "Oh Sheeps", "KNIGHT AGENCY", "And More", "Mile High Comics", "Digikore Studios"]
CLEANNAMES = {
  "Eddie Brock": "Venom (Eddie Brock)",
  "Multiple Man": "Multiple Man (Jamie Madrox)",
  "Phil Coulson (Phil Coulson)": "Phil Coulson",
  "Thunderbolt Ross": "Thaddeus (Thunderbolt) Ross",

  "A CO": "Aco",
  "Andrea DI Vito": "Andrea Di Vito",
  "Carmine DI Giandomenico": "Carmine Di Giandomenico",
  "David&#233; Fabbri": "Davidé Fabbri",
  "Dennis O'neil": "Dennis O'Neil",
  "Dynamite Patrick Berkenkotter": "Patrick Berkenkotter",
  "Gary Hallgren painting": "Gary Hallgren",
  "JEPH YORK": "Jeph York",
  "Jim Shooter - Duplicate": "Jim Shooter",
  "Jj Kirby": "JJ Kirby",
  "R. a. Jones": "R.A. Jones",
}
DUPENAMES = {
  "Ben Grimm": "Thing",
  "Ben Reilly": "Scarlet Spider (Ben Reilly)",
  "Bruce Banner": "Hulk",
  "Captain Marvel (Phyla-Vell)": "Quasar (Phyla-Vell)",
  "Carol Danvers": "Captain Marvel (Carol Danvers)",
  "Charles Xavier": "Professor X",
  "Clint Barton": "Hawkeye",
  "Felicia Hardy": "Black Cat",
  "Frank Castle": "Punisher",
  "James Buchanan Barnes": "Bucky",
  "James Howlett": "Wolverine",
  "Jessica Drew": "Spider-Woman (Jessica Drew)",
  "Johnny Storm": "Human Torch",
  "Logan": "Wolverine",
  "Madrox": "Multiple Man (Jamie Madrox)",
  "Matthew Murdock": "Daredevil",
  "Natasha Romanoff": "Black Widow",
  "Norman Osborn": "Green Goblin (Norman Osborn)",
  "Peter Parker": "Spider-Man (Peter Parker)",
  "Phyla-Vell": "Quasar (Phyla-Vell)",
  "Stephen Strange": "Doctor Strange",
  "Steve Rogers": "Captain America",
  "Sue Storm": "Invisible Woman",
  "Thaddeus Ross": "Thaddeus (Thunderbolt) Ross",
  "The Professor": "Professor X",
  "Tony Stark": "Iron Man",
  "Ultimate Spider-Man (USM)": "Spider-Man (Ultimate)",
  "Victor Von Doom": "Doctor Doom",
  "Yellowjacket (Hank Pym)": "Hank Pym",

  "ALEC FRANCIS SIEGEL": "Alec Siegel",
  "Alex Sviuk": "Alex Saviuk",
  "Andre Aruajo": "Andre Lima Araujo",
  "Andrea Divito": "Andrea Di Vito",
  "Ardian Sayif": "Ardian Syaf",
  "Brian K Vaughn": "Brian K. Vaughan",
  "C Cafu": "Cafu",
  "Carl Pfeuffer": "Carl Pfeufer",
  "Carmine DiGiandomenico": "Carmine Di Giandomenico",
  "Chris Cross": "ChrisCross",
  "Christopher W. Sebela": "Christopher Sebela",
  "Daerick Gross": "Darrick Gross",
  "Dan Decarlo": "Dan De Carlo",
  "David Manak": "Dave Manak",
  "David Ross": "Dave Ross",
  "Dean V. White": "Dean White",
  "Dennis Medri": "Denis Medri",
  "Dennis Oneil": "Dennis O'Neil",
  "Deon Nockuls": "Deon Nuckols",
  "Diogo Saido": "Diogo Saito",
  "Dynamite Jim Krueger": "Jim Krueger",
  "Dynamite Steve Sadowski": "Steve Sadowski",
  "Eliot S. Maggin": "Elliot S. Maggin",
  "F Flaviano": "Flaviano",
  "Felix Ruiz Ruiz": "Felix Ruiz",
  "Frank Marafino": "Frank Marraffino",
  "Freddie Willaims": "Freddie E. Williams",
  "G Geoffo": "Geoffo",
  "Gardner F. Fox": "Gardner Fox",
  "Glenn Herrling": "Glenn Herdling",
  "Guisseppe Cammuncoli": "Giuseppe Camuncoli",
  "HARRY ARTHUR SUYDAM": "Arthur Suydam",
  "Harvey Talibao": "Harvey Tolibao",
  "J. M. DeMatteis": "J.M. DeMatteis",
  "Jack DArcy": "Jack D'ARCY",
  "Jack Harris": "Jack C. Harris",
  "Jacob Parker": "Jake Parker",
  "James Sherman": "Jim Sherman",
  "James Starlin": "Jim Starlin",
  "Jeffrey C. York": "Jeph York",
  "Jefte Paolo": "Jefte Palo",
  "Jess Harrold": "Jess Harold",
  "John Ney Rieber - Duplicate": "John Ney Rieber",
  "John Ridgeway": "John Ridgway",
  "Jon Jay Muth": "Jon J. Muth",
  "Jose Albelo": "Joe Albelo",
  "Juan Santa Cruz": "Juan Santacruz",
  "Kelly Jones": "Kelley Jones",
  "Kevin Knowlan": "Kevin Nowlan",
  "Kevin Walker": "Kev Walker",
  "Lenny Herman": "Lennie Herman",
  "Liam Sharpe": "Liam Sharp",
  "M Mast": "JL Mast",
  "M. C. Wyman": "M.C. Wyman",
  "MARK J. SIMMONS": "Mark Simmons",
  "MK - Darick Robertson": "Darick Robertson",
  "Marc Bernadin": "Marc Bernardin",
  "Mario DelPennino": "Mario Del Pennino",
  "Mark Miller": "Mark Millar",
  "Marty Egeland": "Martin Egeland",
  "Michael OHare": "Michael O'hare",
  "Mike O Sullivan": "Mike O'sullivan",
  "Nel Tomitov": "Nel Yomtov",
  "Philip J. Noto": "Phil Noto",
  "Phillip Bond": "Philip Bond",
  "Pop Mahn": "Pop Mhan",
  "R. Jones": "R.A. Jones",
  "Ramon Rosasnas": "Ramon Rosanas",
  "Ricardo LÓpez Ortiz": "Ricardo Lopez-Ortiz",
  "Roberto Delatorre": "Roberto De La Torre",
  "Roger R. Robinson": "Roger Robinson",
  "Stephan Roux": "Stephane Roux",
  "Steve Butler": "Steven Butler",
  "Steve Harris": "Steven Harris",
  "Steve Leiber": "Steve Lieber",
  "Tod Smith": "Todd Smith",
  "Trevor von Eedon": "Trevor Von Eeden",
  "Val Semekis": "Val Semeiks",
  "Valentine Delandro": "Valentine De Landro",
  "Vincent Evans": "Vince Evans",
  "Walter M. Simonson": "Walt Simonson",
  "Wellinton Alves": "Wellington Alves",
  "William Messnerloebs": "William Messner-Loebs",
  "William Meugniot": "Will Meugniot",
}
SPLITNAMES = {
  "Chad Bowers & Chris Sims": " & ",
  "Chriscross and Chris Sotomayor": " and ",
  "Rob Liefeld, ": ","
}
SWITCHATTRS = {
  "captain marvel (phyla-vell)": ["image"],
  "green goblin (norman osborn)": ["image"],
  "hank pym": ["image_url"],
  "jean grey": ["image_url"],
  "multiple man (jamie madrox)": ["image"],
  "scarlet spider (Ben Reilly)": ["image_url"],
  "wolverine": ["image_url"]
}
def build_graph(nodes_type, links_type, comics, nodes):
    skipIDs = set()
    dupesIds = {}
    G = nx.Graph()
    nodes_map = {}
    split_map = {}
    for n in nodes:
        attrs = {
            "id": n["id"],
            "description": n.get("description", ""),
            "image": n["image"],
            "image_url": n["thumbnail"]["path"] + "." + n["thumbnail"]["extension"],
            "url": n["urls"][0]["url"],
            links_type: 0
        }
        if nodes_type == "creators":
            attrs["label"] = n.get("fullName") or " ".join(n[k] for k in ["firstName", "middleName", "lastName", "suffix"] if n[k])
            attrs["writer"] = 0
            attrs["artist"] = 0
        elif nodes_type == "characters":
            attrs["label"] = n["name"]
            attrs["description"] = n["description"]
        label = attrs["label"].lower()

        # Skip names from blacklist
        for skip in SKIPNAMES:
            if label.startswith(skip.lower()):
                skipIDs.add(n["id"])
                continue

        # Clean known bad names
        for bad, good in CLEANNAMES.items():
            if label == bad.lower():
                attrs["label"] = good
                label = good.lower()

        # Handle perfect name duplicates
        if label in nodes_map:
            dupesIds[n["id"]] = nodes_map[label]
            if label in SWITCHATTRS:
                for key in SWITCHATTRS[label]:
                    G.nodes[nodes_map[label]][key] = attrs[key]
        # Keep others and store map of label -> id
        else:
            nodes_map[label] = n["id"]
            G.add_node(n["id"], **attrs)

    # Handle bad cleaning cases
    for n in list(G.nodes):
        label = G.nodes[n]["label"].lower()

        # Handle blurry name duplicates from fixed list
        for dupe, good in DUPENAMES.items():
            if label == dupe.lower():
                good = good.lower()
                dupesIds[n] = nodes_map[good]
                if good in SWITCHATTRS:
                    for key in SWITCHATTRS[good]:
                        if G.nodes[n][key] and "available" not in G.nodes[n][key]:
                            G.nodes[dupesIds[n]][key] = G.nodes[n][key]
                G.remove_node(n)
                break
        if not G.has_node(n):
            continue

        # Handle unsplit names by remembering to replace the entry by the splitted list of ids from nodes map
        for begin, splitter in SPLITNAMES.items():
            if label.startswith(begin.lower()) and splitter in label:
                split_map[n] = []
                for subname in label.split(splitter):
                    subname = subname.strip()
                    if subname in nodes_map:
                        split_map[n].append(nodes_map[subname])
                    else:
                        print("WARNING could not find", nodes_type, subname, "from splitted", label, file=sys.stderr)
                G.remove_node(n)
                break

    for comic in comics:
        # Apply threshold : remove stories with too many authors or characters
        if comic[nodes_type]["returned"] > CONF["cooccurrence_threshold_for_" + nodes_type]:
            continue

        # Replace unsplit nodes by the splitted list
        for i, c in enumerate(comic[nodes_type]["items"]):
            cid = extractID(c)
            if cid in split_map:
                comic[nodes_type]["items"].pop(i)
                comic[nodes_type]["items"] += [{"id": i, "role": c.get("role", "")} for i in split_map[cid]]

        for i, c1 in enumerate(comic[nodes_type]["items"]):
            c1id = extractID(c1)

            # Replace duplicates nodes by their proper id and skip bad ones
            if c1id in dupesIds:
                c1id = dupesIds[c1id]
            if c1id in skipIDs:
                continue

            # Keep only artists and writers for creators and count the repartition and total
            if nodes_type == "creators":
                role = c1.get("role", "").lower().strip()
                if "cover" in role or role in ["editor", "letterer", "inker", "colorist"]:
                    continue
                if role in ["artist", "painter", "penciller", "penciler"]:
                    role_key = "artist"
                elif role == "writer":
                    role_key = "writer"
                G.nodes[c1id][role_key] += 1
            G.nodes[c1id][links_type] += 1

            for c2 in comic[nodes_type]["items"][i+1:]:

                # Keep only artists and writers for creators
                if nodes_type == "creators":
                    role = c2.get("role", "").lower().strip()
                    if "cover" in role or role in ["editor", "letterer", "inker", "colorist"]:
                        continue
                c2id = extractID(c2)

                # Skip autolinks
                if c1id == c2id:
                    continue

                # Replace duplicates nodes by their proper id and skip bad ones
                if c2id in dupesIds:
                    c2id = dupesIds[c2id]
                if c2id in skipIDs:
                    continue

                # Add edge or weight
                if G.has_edge(c1id, c2id):
                    G.edges[c1id, c2id]["weight"] += 1
                else:
                    G.add_edge(c1id, c2id, weight=1)

    # Keep first connex component and save "full" graph as such
    biggest_component = max(nx.connected_components(G), key=len)
    nx.write_gexf(G.subgraph(biggest_component).copy(), os.path.join("data", "Marvel_%s_by_%s_full.gexf" % (nodes_type, links_type)))

    # Remove less frequent nodes for "small" graph,then keep first connex component again ans save
    for node in list(G.nodes):
        if G.nodes[node][links_type] < CONF["min_" + links_type + "_for_" + nodes_type]:
            G.remove_node(node)
    biggest_component = max(nx.connected_components(G), key=len)
    nx.write_gexf(G.subgraph(biggest_component).copy(), os.path.join("data", "Marvel_%s_by_%s.gexf" % (nodes_type, links_type)))
    return G

def build_csv(entity, rows, fields):
    with open(os.path.join("data", "Marvel_%s.csv" % entity), "w") as csvf:
        writer = csv.writer(csvf)
        writer.writerow(fields)
        for row in rows:
            writer.writerow([row[f] for f in fields])

if __name__ == "__main__":
    comics = []
    for comics_type in ["comic", "digital comic", "infinite comic"]:
        comics += download_entity("comics", {
            "format": comics_type,
            "noVariants": "true",
            "orderBy": ["title", "issueNumber"]
        })
    stories = download_entity("stories", {"orderBy": "id"}, {"type": "story"})
    characters = download_entity("characters", {"orderBy": "name"})
    creators = download_entity("creators", {"orderBy": ["lastName", "firstName"]})
    build_graph("characters", "stories", stories, characters)
    build_graph("creators", "stories", stories, creators)
    build_graph("characters", "comics", comics, characters)
    build_graph("creators", "comics", comics, creators)
    build_csv("comics", comics, [])
    build_csv("stories", stories, [])
