const setup = require('./lib.js');

if(setup.isOsx) { 
  setup.installOsxPackages() 
}

if(setup.isArch) {
  setup.installArchCore()
}

setup.configureZshrc()
setup.installCore()
setup.installDevEnv()