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
  add: x => console.log(color.ok(x)),
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

const writeFile = (path, content) => {
  if(path.startsWith(os.homedir()))
    return fs.writeFileSync(path, res)
  // for anything else let's use sudo
  fs.writeFileSync('/tmp/ensurelines', res)
  run(`sudo mv /tmp/ensurelines ${path}`)
}

const readFile = (path, alternative = null) => {
  if(fs.existsSync(path)) return fs.readFileSync(path, 'utf-8')
  if(alternative == null) return print.fatal(`Cannot read file ${path}`)
  return alternative
}

const ensureLines = (path, ...lines) => {
  cl = readFile(path, '').split(/\r?\n/).map(x => x.trim())

  changed = false;
  lines.forEach(line => {
    if(!cl.includes(line)) {
      cl.push(line)
      print.add(`    > ${path}: + ${line}`)
      changed = true;
    }
  })

  if(changed) {
    res = cl.join("\n")
    if(!res.endsWith("\n")) res += "\n"
    writeFile(path, res)
  }
  print.ok(`ensure lines in ${path}`)
}

const ensureJson = (path, j) => {
  c = readFile(path, '')
  org = JSON.parse(c)
  for(key in j) org[key] = j[key]
  res = JSON.stringify(org, null, 2)
  install(`json ${path}`, () => c !== res, () => writeFile(path, res))
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
    'git', 'vim', 'vim-surround', 'curl', 'htop', 'p7zip',
    'openssh', 'sshfs', 'networkmanager', 'network-manager-applet', 'tree',
    // deps for parallels tools
    'base-devel', 'python2', 'linux-headers',
    // ui basics
    'xorg', 'xf86-video-vesa', 'mesa-libgl', 'lightdm', 'lightdm-deepin-greeter',
    'ttf-inconsolata', 'gnome-keyring', 'arc-gtk-theme',
    // i3
    'i3', 'xfce4-terminal', 'terminator', 'compton', 'dmenu', 'dunst',
    'gnome-settings-daemon', 'feh', 'udiskie',
    // web
    'firefox', 'chromium',
    // cli tools
    'zsh', 'the_silver_searcher', 'jq',
    // productivity
    'visual-studio-code', 'meld', 'colordiff',
    'ruby', 'go', 'docker', 'gimp', 'imagemagick',
    // unproductivity
    'youtube-dl', 'telegram-desktop-bin', 'slack-desktop', 'mpv', 'x265', 'alsa-utils',
    'gthumb', 'evince',
  )

  ensureLines("/etc/locale.conf", "LANG=en_US.utf8")
  ensureLines("/etc/locale.gen", "en_US.UTF-8 UTF-8")
  run("sudo locale-gen")

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
  ensure = x => { if(!c.includes(x)) c += "\n"+x; }
  ensure('PATH=$HOME/.gem/ruby/2.4.0/bin:$PATH')
  ensure('export GOPATH=/pub/go')
  ensure('export $(gnome-keyring-daemon -s)')
  ensure('PATH=/pub/go/bin:$PATH')
  ensure('alias b="bundle exec"')
  ensure('alias ya="youtube-dl -f bestaudio --audio-quality 0 -i -x --extract-audio"')
  ensure('alias yav="youtube-dl -f bestvideo+bestaudio --audio-quality 0 -i --merge-output-format mkv"')
  fs.writeFileSync(zshrc, c)
}
configureZshrc()

// Gtk config with dark color theme
const gtkVariant = 'dark'
const gtk2confPath = path.join(os.homedir(), '.gtkrc-2.0')
const gtk3confPath = path.join(os.homedir(), '.config/gtk-3.0/settings.ini')
install('gtk2 config', false, () => syncFile('gtk2settings.'+gtkVariant+'.ini', gtk2confPath))
install('gtk3 config', false, () => syncFile('gtk3settings.'+gtkVariant+'.ini', gtk3confPath))

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

// Visual Studio Code config
const vscodeExist = runq('code --list-extensions').stdout.toString().trim().split(/\r?\n/)
const vscodeExtensions = (...x) =>
  x.forEach(y => install(`vscode: ${y}`, () => vscodeExist.includes(y), () => run(`code --install-extension ${y}`)))

vscodeExtensions(
  'vscodevim.vim',
  'lukehoban.Go',
  'zxh404.vscode-proto3',
  'dbaeumer.vscode-eslint',
  'HookyQR.beautify',
  'BriteSnow.vscode-toggle-quotes'
)

ensureJson(path.join(os.homedir(), '.config/Code/User/settings.json'),
  {
    "editor.rulers": [80],
    "editor.tabSize": 2,
    "editor.insertSpaces": true,
    "vim.useCtrlKeys": false,
    "vim.overrideCopy": false,
    "vim.insertModeKeyBindings": [
        {
            "before": ["k", "j"],
            "after": ["<Esc>"]
        },
        {
            "before": ["j", "k"],
            "after": ["<Esc>"]
        }
    ],
    "vim.autoindent": true,
    "vim.surround": true,
    "go.formatOnSave": true,
    "go.formatTool": "goimports",
  }
)

// NPM
install('eslint', () => commandExists('eslint'), () => run('sudo npm install -g eslint'))
install('gulp', () => commandExists('gulp'), () => run('sudo npm install -g gulp'))

// Go
install('goimports', () => commandExists('goimports'), () => run('go get golang.org/x/tools/cmd/goimports'))
install('dep', () => commandExists('dep'), () => run('go get -u github.com/golang/dep/cmd/dep'))

// Ruby gems
install('pry', () => commandExists('pry'), () => run('gem install pry'))
install('bundler', () => commandExists('bundle'), () => run('gem install bundler'))
install('inspec', () => commandExists('inspec'), () => run('gem install inspec'))
run('gem update')
