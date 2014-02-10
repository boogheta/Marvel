#!/bin/bash

dataset=$1

source config
ts=$(date +%s)
key="ts=$ts&apikey=$key&hash="$(echo -n "$ts$secret$key" | md5sum | awk '{print $1}')

echo "Work on $dataset"
echo "-----------"
mkdir -p data/$dataset
i=0
max=15
while [ $i -lt $max ]; do
  ct=0
  echo " -> DL $dataset page $i"
  while [ $ct -lt 3 ] && [ ! -s data/$dataset/$i.json ]; do
    curl -f -s -L "http://gateway.marvel.com/v1/public/$dataset?$key&limit=100&orderBy=modified&offset="$(($i*100)) > data/$dataset/$i.json
    ct=$(($ct+1))
  done
  if [ $i -eq 0 ]; then
    max=$(($(cat data/$dataset/0.json | sed 's/^.*,"total"://' | sed 's/,".*$//') / 100 + 1))
    echo " -> Set total $dataset page to $max"
  fi
  i=$(($i+1))
done
echo " -> Assemble all jsons into data/$dataset.json"
./bin/assemble_jsons.py data/characters > data/characters.json
echo

