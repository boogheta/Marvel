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
        with open(cache_file) as f:
            return json.load(f)

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
        thumbnail_url = item["thumbnail"]["path"] + "/standard_small." + item["thumbnail"]["extension"]
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

extractID = lambda n: int(n["resourceURI"].split("/")[-1])

def build_graph(nodes_type, links_type, comics, nodes):
    skipIDs = set()
    G = nx.Graph()
    for n in nodes:
        attrs = {
            "id": n["id"],
            "resourceURI": n["resourceURI"],
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
            attrs["unknown_role"] = 0
        elif nodes_type == "characters":
            attrs["label"] = n["name"]
            attrs["description"] = n["description"]
        if attrs["label"].startswith("Various"):
            skipIDs.add(n["id"])
            continue
        G.add_node(n["id"], **attrs)

    for comic in comics:
        if comic[nodes_type]["returned"] > CONF["cooccurrence_threshold_for_" + nodes_type]:
            continue
        for i, c1 in enumerate(comic[nodes_type]["items"]):
            c1id = extractID(c1)
            if c1id in skipIDs:
                continue
            if nodes_type == "creators":
                role = c1.get("role", "").lower().strip()
                if "cover" in role or role in ["editor", "letterer", "inker", "colorist"]:
                    continue
                if role in ["artist", "painter", "penciller", "penciler"]:
                    role_key = "artist"
                elif role == "writer":
                    role_key = "writer"
                elif not role:
                    role_key = "unknown_role"
                G.nodes[c1id][role_key] += 1
            G.nodes[c1id][links_type] += 1
            for c2 in comic[nodes_type]["items"][i+1:]:
                if nodes_type == "creators":
                    role = c2.get("role", "").lower().strip()
                    if "cover" in role or role in ["editor", "letterer", "inker", "colorist"]:
                        continue
                c2id = extractID(c2)
                if c2id in skipIDs:
                    continue
                if G.has_edge(c1id, c2id):
                    G.edges[c1id, c2id]["weight"] += 1
                else:
                    G.add_edge(c1id, c2id, weight=1)
    biggest_component = max(nx.connected_components(G), key=len)
    nx.write_gexf(G.subgraph(biggest_component).copy(), os.path.join("data", "Marvel_%s_by_%s_full.gexf" % (nodes_type, links_type)))
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
