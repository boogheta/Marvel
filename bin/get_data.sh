#!/bin/bash

datasets="characters creators events series comics stories"
for d in $datasets; do
  bin/get_dataset.sh $d
done

