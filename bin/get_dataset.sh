#!/bin/bash

dataset=$1
st=$2
if [ -z $st ]; then
  st=0
fi

source config
ts=$(date +%s)
key="ts=$ts&apikey=$key&hash="$(echo -n "$ts$secret$key" | md5sum | awk '{print $1}')

echo "Work on $dataset" >&2
echo "-----------" >&2
mkdir -p data/$dataset
i=$st
max=$(($st+15))
while [ $i -lt $max ]; do
  ct=0
  if [ ! -s data/$dataset/$i.json ]; then
    echo " -> DL $dataset page $i" >&2
  fi
  while [ $ct -lt 3 ] && [ ! -s data/$dataset/$i.json ]; do
    curl -f -s -L "http://gateway.marvel.com/v1/public/$dataset?$key&limit=100&orderBy=modified&offset="$(($i*100)) > data/$dataset/$i.json
    ct=$(($ct+1))
  done
  if [ $i -eq 0 ]; then
    tot=$(cat data/$dataset/0.json | sed 's/^.*,"total"://' | sed 's/,".*$//')
    max=$(($tot / 100 + 1))
    echo " -> Set total $dataset page to $max" >&2
    echo " -> Should get a total of $tot $dataset" >&2
  fi
  i=$(($i+1))
done
echo " -> Assemble all jsons into data/$dataset.json" >&2
if [ $st -eq 0 ]; then
  ./bin/assemble_jsons.py data/$dataset > data/$dataset.json
fi
echo >&2

