const setup = require('./shared/lib.js');

if(setup.isOsx) { 
  setup.installOsxBase()
}

if(setup.isArch) {
  setup.installArchCore()
}

setup.configureZshrc()
setup.installCore()
setup.installDevEnv()
// setup.installAmdGraphics()