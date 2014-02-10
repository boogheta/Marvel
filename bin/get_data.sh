#!/bin/bash

datasets="characters creators" #series comics events stories
for d in $datasets; do
  bin/get_dataset.sh $d
done

