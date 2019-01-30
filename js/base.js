const setup = require('./lib.js');

if(setup.isArch) {
  setup.installArchBoot()
}

if(setup.isOsx) {
  setup.installOsxBase()
}
