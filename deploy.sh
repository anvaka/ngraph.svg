#!/bin/sh
rm -rf ./docs
npm run build:demo
cd ./docs
git init
git add .
git commit -m 'push to gh-pages'
git push --force git@github.com:anvaka/ngraph.svg.git main:gh-pages
cd ../
