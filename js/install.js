import * as setup from './shared/lib.js';
import { select, input } from '@inquirer/prompts';

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
  console.log("Name: "+o.name)
}
if(o.email == '') {
  o.email = await input({ message: 'What is your email? (used for git settings)' });
} else {
  console.log("Email: "+o.email)
}

if(setup.isArch) {
  setup.installArchBoot()
  setup.installArchCore()
}

if(setup.isOsx) {
  setup.installOsxBase()
}

setup.configureZshrc()
setup.installCore()
setup.installDevEnv(o.name, o.email)
if(installMode == 'server') {
  setup.installAsServer()
}

if(graphics == 'amd') {
  setup.installAmdGraphics()
}
