const setup = require('./shared/lib.js');

if(setup.isArch) {
  setup.installArchBoot()
}

if(setup.isOsx) {
  setup.installOsxBase()
}
