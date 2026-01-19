import * as setup from './shared/lib.js';
import { select, input, checkbox } from '@inquirer/prompts';
import os from 'os';

const INSTALL_CORE = 'core'
const INSTALL_DEV = 'dev'
const INSTALL_ZSH = 'zsh'
const INSTALL_CONTAINER = 'container'

const scope = await checkbox({
  message: 'Select all the things to install',
  choices: [
    {name: 'Core', value: INSTALL_CORE},
    {name: 'Dev Env', value: INSTALL_DEV},
    {name: 'Zsh', value: INSTALL_ZSH},
    {name: 'Container Runtime', value: INSTALL_CONTAINER},
  ]
})

try {
  const userInfo = os.userInfo();
  const username = userInfo.username;
  console.log("Username: "+username)
} catch(err) {
  console.log("Error getting userinfo: ", err)
  process.exit(1)
}

const installMode = await select({
  message: 'Select the installation mode',
  choices: [
    {
      name: 'Server',
      value: 'server',
      description: 'Do not install power-saving features',
    },
    {
      name: 'Laptop',
      value: 'laptop',
      description: 'Installation with power-saving features'
    },
  ]
})

const graphics = await select({
  message: 'Select the graphics to be used',
  choices: [
    {
      name: 'Default',
      value: 'default',
      description: 'No special graphics, will use sane defaults',
    },
    {
      name: 'AMD',
      value: 'amd',
      description: 'Install AMD graphics',
    },
  ]
})

const o = setup.GitSettings()
if(o.name == '') {
  o.name = await input({ message: 'What is your name? (used for git settings)' });
} else {
  console.log("Git Name: "+o.name)
}
if(o.email == '') {
  o.email = await input({ message: 'What is your email? (used for git settings)' });
} else {
  console.log("Git Email: "+o.email)
}

if(setup.isArch) {
  if(scope.includes(INSTALL_CORE)) {
    setup.installArchBoot()
    setup.installArchCore()
  }
  if(scope.includes(INSTALL_CONTAINER)) {
    setup.installContainerRuntime(username)
  }
}

if(setup.isOsx) {
  if(scope.includes(INSTALL_CORE)) {
    setup.installOsxBase()
  }
}

if(scope.includes(INSTALL_ZSH)) {
  setup.configureZsh()
}

if(scope.includes(INSTALL_DEV)) {
  setup.installDevEnv(o.name, o.email)
}

if(installMode == 'server') {
  setup.installAsServer()
}

if(graphics == 'amd') {
  setup.installAmdGraphics()
}
