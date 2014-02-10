#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys, os, re, json
import pymongo

re_data_name = re.compile(r'^.*/([^/]+)$')
try:
    jsondir = sys.argv[1]
    assert(os.path.isdir(jsondir))
    dataset = re_data_name.sub(r'\1', jsondir)
except:
    sys.stderr.write('Usage ./assemble_jsons.py <directory where the set of jsons are> [<save_in_mongo instead of log output>]\n')
    sys.exit(1)

total = 0
res = []
try:
    db = pymongo.Connection('localhost', 27017)["marvel"]
    db.drop_collection(dataset)
    coll = db[dataset]
#    coll.ensure_index([('timestamp', pymongo.ASCENDING)], background=True)
except Exception as e:
    sys.stderr.write('ERROR: Could not initiate connection to MongoDB: %s %s\n' % (type(e), e))
    sys.exit(1)

re_match_file = re.compile(r'(^|%s)\d+.json$' % os.sep)
for jsonfile in os.listdir(jsondir):
    if not re_match_file.search(jsonfile):
        continue
    try:
        with open(os.path.join(jsondir, jsonfile)) as f:
            data = json.loads(f.read())['data']
    except Exception as e:
        sys.stderr.write("WARNING: Error reading file %s: %s %s\n" % (jsonfile, type(e), e))
        continue
    if total and total != data['total']:
        sys.stderr.write("WARNING: Different total values in different files: %s & %s\n" % (total, data['total']))
    total = data['total']
    if dataset != "comics":
        res += data['results']
    for d in data['results']:
        d['_id'] = d['id']
        coll.save(d)
    del(data)

if res:
    print json.dumps(res, ensure_ascii=False).encode('utf8')
    tot = len(res)
else:
    tot = total
total = len(list(coll.find()))
sys.stderr.write(" -> Saved a total of %s %s against supposedly %s\n" % (total, dataset, tot))
