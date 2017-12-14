#!/usr/bin/env node
const inquirer = require('inquirer');
const chalk = require('chalk');
const shell = require('shelljs');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const process = require('process');

const color = {
  cmd: chalk.blue,
  ok: chalk.green,
  err: chalk.red,
  info: chalk.cyan,
}
const print = {
  ok: x => console.log(color.ok('[ok] '+x)),
  err: x => console.log(color.err(x)),
  fatal: x => { console.log(color.err(x)); process.exit(1) },
  cmd: x => console.log(color.cmd(x)),
  info: x => console.log(color.info(x)),
}

const runq = x => spawnSync('bash', ['-c', x])
const run = x => {
  print.cmd(`----> ${x}`)
  return shell.exec(x)
}
const commandExists = x => spawnSync('command',['-v', x]).status == 0

const gitClone = (src, dst) => run(`git clone ${src} ${dst}`)
const gitEnsure = (src, path) => {
  if(!fs.existsSync(path)) gitClone(src, path);
  return run(`cd ${path} && git fetch --all && git pull`)
}

const installRun = (cmd, list) => {
  res = run(cmd)
  if(res.status == 0) {
    print.ok(`Installation ${list} successful`);
    return true;
  }
  print.err(`Failed to install ${list}: ${res.stderr}`);
  return false;
}
const brewInstall = x => installRun(`brew install ${x.join(' ')}`, x)
const yaourtInstall = (...x) => installRun(`yaourt -S --needed --noconfirm ${x.join(' ')}`, x)
const isOsx = /^darwin/.test(process.platform)
const isArch = process.platform == 'linux' && fs.existsSync('/usr/bin/yaourt') 
const cannotInstall = x =>
  print.err(`Cannot detect OS to install ${x}`) &&
  shell.exit(1)
const package = 
  isOsx ? brewInstall :
  isArch ? yaourtInstall :
  cannotInstall

const install = (what, exists, installF) => {
  if(exists === false || !exists()) installF()
  print.ok(`${what}`);
}
const installCmd = (what, test = null) =>
  (test == null) ? installCmd(what, () => commandExists(what)) :
  (typeof test === 'string') ? installCmd(what, () => commandExists(test)) :
  install(what, test, () => package(what))
const syncFile = (src, dst) => {
  srcp = path.join('files', src);
  if(!fs.existsSync(srcp))
    return print.err(`Cannot find source file in ${srcp}`)
  console.log(`${srcp} -> ${dst}`)
  return shell.cp(srcp, dst)
}
const syncFiles = (src, dst) => {
  srcp = path.join('files', src);
  if(!fs.existsSync(srcp))
    return print.err(`Cannot find source file in ${srcp}`)
  console.log(`${srcp} -> ${dst}`)
  shell.mkdir('-p', path.dirname(dst))
  return shell.cp('-R', srcp, dst)
}

// OSX
function installOsxPackages() {
  install('brew', () => commandExists('brew'), () => run(
    '/usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"'
  ))
  installCmd('ag')
  installCmd('zsh')
  installCmd('the_silver_searcher', 'ag')
}
if(isOsx) { installOsxPackages() }

// Arch
const resolution = '1920x1200'
function installArchPackages() {
  package(
    // basics
    'git', 'vim', 'vim-surround', 'curl', 'htop',
    'openssh', 'networkmanager', 'network-manager-applet', 'tree',
    // deps for parallels tools
    'base-devel', 'python2', 'linux-headers',
    // ui basics
    'xorg', 'xf86-video-vesa', 'mesa-libgl', 'lightdm', 'lightdm-deepin-greeter',
    'ttf-inconsolata',
    // i3
    'i3', 'xfce4-terminal', 'terminator', 'compton', 'dmenu',
    'gnome-settings-daemon', 'feh', 'udiskie',
    // web
    'firefox', 'chromium',
    // cli tools
    'zsh', 'the_silver_searcher',
    // productivity
    'visual-studio-code', 'meld', 'colordiff',
    'ruby', 'go',
    // unproductivity
    'youtube-dl', 'telegram-desktop-bin', 'mpv', 'x265', 'alsa-utils',
    'gthumb', 'evince',
  )

  configureLightdm = () => {
    p = '/etc/lightdm/lightdm.conf'
    c = fs.readFileSync(p, 'utf-8')
    c = c.replace(/^#?greeter-session=.*/m, 'greeter-session=lightdm-deepin-greeter')
    c = c.replace(/^#?display-setup-script=.*/m, `display-setup-script=xrandr --output default --mode ${resolution}`)
    fs.writeFileSync('/tmp/lightdmconf', c)
    run(`sudo mv /tmp/lightdmconf ${p}`)
  }
  install('configure lightdm', false, configureLightdm)
  run('sudo systemctl enable NetworkManager')

  run('sudo ln -sf /usr/lib/systemd/scripts/ /etc/init.d')
  run('sudo touch /etc/X11/xorg.conf')
  run('sudo ln -sf /usr/bin/python2 /usr/local/bin/python')
  installParallelsTools = () => {
    console.error("Please install parallels tools manually!")
  }
  install('parallels-tools', () => fs.existsSync('/usr/lib/parallels-tools/version'), () => installParallelsTools())

  const configureI3 = () => syncFiles('i3.config', path.join(os.homedir(), '.i3/config'))
  install('i3-config', false, configureI3)

  const configureCompton = () => syncFiles('compton.conf', path.join(os.homedir(), '.config/compton.conf'))
  install('compton conf', false, configureCompton)

  const configureTerm = () => syncFiles('xfce4terminal.rc', path.join(os.homedir(), '.config/xfce4/terminal/terminalrc'))
  install('xfce4-terminal', false, configureTerm)
}
if(isArch) { installArchPackages() }

// ZSH
const zshrc = path.join(os.homedir(), '.zshrc')
const defaultZsh = () => run('chsh -s /bin/zsh')
//install('zsh-default', () => process.env.SHELL == '/bin/zsh', defaultZsh)
const installOhMyZsh = () => {
  gitEnsure('git://github.com/robbyrussell/oh-my-zsh.git', path.join(os.homedir(), '.oh-my-zsh'))
  if(!fs.existsSync(zshrc))
    shell.cp("~/.oh-my-zsh/templates/zshrc.zsh-template", zshrc)
  return run('curl https://raw.githubusercontent.com/arlimus/zero.zsh/master/bootstrap.sh | sh -')
}
install('oh-my-zsh', false, installOhMyZsh)
const configureZshrc = () => {
  c = fs.readFileSync(zshrc, 'utf-8')
  c = c.replace(/ZSH_THEME=.*/, 'ZSH_THEME="zero-dark"')
  c = c.replace(/plugins=\((.+[\s\S])+\)/, 'plugins=(git zero)')
  p = 'PATH=$HOME/.gem/ruby/2.4.0/bin:$PATH'
  if(!c.includes(p)) c += "\n"+p;
  fs.writeFileSync(zshrc, c)
}
configureZshrc()

// Gitconfig
const gitconfPath = path.join(os.homedir(), '.gitconfig')
const gitconfSet = x => {
  run(`git config --global user.name "${x.name}"`)
  run(`git config --global user.email "${x.email}"`)
}
const gitconfSettings = () => {
  print.info('configure global git settings')
  q = [
    { type: 'input', name: 'name', message: 'What is your name' },
    { type: 'input', name: 'email', message: 'What is your email' },
  ]
  return inquirer.prompt(q).then(gitconfSet)
}
const installGitconf = () => {
  o = {
    name: runq('git config --global user.name').stdout.toString().trim(),
    email: runq('git config --global user.email').stdout.toString().trim(),
  };
  syncFile('gitconfig', gitconfPath)
  if(o.name == '' || o.name == 'Your Name' || o.email == '') gitconfSettings()
  else gitconfSet(o);
}
install('gitconfig', false, installGitconf)

// Vim config
const vimrcPath = path.join(os.homedir(), '.vimrc')
const installVimrc = () => syncFile('vimrc', vimrcPath)
const installColors = () => syncFiles('vimcolors', path.join(os.homedir(), '.vim/colors'))
install('vimrc', false, () => installVimrc() && installColors())

// Ruby gems
run('gem install pry')
