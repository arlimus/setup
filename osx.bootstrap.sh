#!/bin/sh

install_brew() {
  echo "----> install brew"
  /usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
}

command -v brew || install_brew

install_node() {
  echo "----> install node"
  brew install node
}

command -v node || install_node
