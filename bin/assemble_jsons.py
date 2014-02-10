#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys, os, re, json

try:
    jsondir = sys.argv[1]
    assert(os.path.isdir(jsondir))
except:
    sys.stderr.write('Usage ./assemble_jsons.py <directory where the set of jsons are>\n')
    sys.exit(1)

res = []
total = 0

re_match_file = re.compile(r'(^|%s)\d+.json$' % os.sep)
for jsonfile in os.listdir(jsondir):
    if not re_match_file.search(jsonfile):
        continue
    try:
        with open(os.path.join(jsondir, jsonfile)) as f:
            data = json.loads(f.read())['data']
    except Exception as e:
        print type(e),e
        sys.stderr.write("WARNING: Error reading file %s\n" % jsonfile)
        continue
    if total and total != data['total']:
        sys.stderr.write("WARNING: Different total values in different files: %s & %s\n" % (total, data['total']))
    total = data['total']
    res += data['results']

print json.dumps({'characters': res}, ensure_ascii=False).encode('utf8')

