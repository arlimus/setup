const setup = require('./lib.js');

if(setup.isArch) {
  setup.installArchBoot()
}

require('./zll.jx')

