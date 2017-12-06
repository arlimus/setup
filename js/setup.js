#!/usr/bin/env node
const inquirer = require('inquirer');
const chalk = require('chalk');
const shell = require('shelljs');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const colorCmd = chalk.blue
const colorOk = chalk.green
const colorErr = chalk.red
const colorInfo = chalk.cyan

const runq = x => spawnSync('bash', ['-c', x])
const run = x => {
  console.log(colorCmd(`----> ${x}`))
  return shell.exec(x)
}
const commandExists = x => spawnSync('command',['-v', x]).status == 0

const gitClone = (src, dst) => run(`git clone ${src} ${dst}`)
const gitEnsure = (src, path) => {
  if(!fs.existsSync(path)) gitClone(src, path);
  return run(`cd ${path} && git fetch --all && git pull`)
}

const brewInstall = x => {
  res = run(`brew install ${x}`)
  if(res.status == 0) {
    console.log(colorOk(`Installation of ${x} successful`));
    return true;
  }
  console.log(colorErr(`Failed to install ${x}: ${res.stderr}`));
  return false;
}
const isOsx = /^darwin/.test(process.platform)
const cannotInstall = x =>
  console.log(colorErr(`Cannot detect OS to install ${x}`)) &&
  shell.exit(1)
const packageInstall = x =>
  isOsx ? brewInstall(x) :
  cannotInstall(x)

const install = (what, exists, install) => {
  if(exists()) return console.log(colorOk(`[ok] ${what}`));
  return install()
}
const syncFile = (src, dst) => {
  srcp = path.join('files', src);
  if(!fs.existsSync(srcp))
    return console.log(colorErr(`Cannot find source file in ${srcp}`))
  console.log(`${srcp} -> ${dst}`)
  return shell.cp(srcp, dst)
}
const syncFiles = (src, dst) => {
  srcp = path.join('files', src);
  if(!fs.existsSync(srcp))
    return console.log(colorErr(`Cannot find source file in ${srcp}`))
  console.log(`${srcp} -> ${dst}`)
  shell.mkdir('-p', path.dirname(dst))
  return shell.cp('-R', srcp, dst)
}

// Brew
const installBrew = () => run('/usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"')
install('brew', () => commandExists('brew'), installBrew)

// AG
const installAg = () => packageInstall('ag')
install('ag', () => commandExists('ag'), installAg)

// ZSH
const zshrc = path.join(os.homedir(), '.zshrc')
const installZsh = () => packageInstall('zsh')
install('zsh', () => commandExists('zsh'), installZsh)
const defaultZsh = () => run('chsh -s /bin/zsh')
install('zsh-default', () => process.env.SHELL == '/bin/zsh', defaultZsh)
const installOhMyZsh = () => {
  gitEnsure('git://github.com/robbyrussell/oh-my-zsh.git', path.join(os.homedir(), '.oh-my-zsh'))
  if(!fs.existsSync(zshrc))
    shell.cp(`~/.oh-my-zsh/templates/zshrc.zsh-template ${zshrc}`)
  return run('curl https://raw.githubusercontent.com/arlimus/zero.zsh/master/bootstrap.sh | sh -')
}
install('oh-my-zsh', () => false, installOhMyZsh)

// Gitconfig
const gitconfPath = path.join(os.homedir(), '.gitconfig')
const gitconfSet = x => {
  run(`git config --global user.name "${x.name}"`)
  run(`git config --global user.email "${x.email}"`)
}
const gitconfSettings = () => {
  console.log(colorInfo('configure global git settings'))
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
install('gitconfig', () => false, installGitconf)

// Vim config
const vimrcPath = path.join(os.homedir(), '.vimrc')
const installVimrc = () => syncFile('vimrc', vimrcPath)
const installColors = () => syncFiles('vimcolors', path.join(os.homedir(), '.vim/colors'))
install('vimrc', () => false, () => installVimrc() && installColors())
