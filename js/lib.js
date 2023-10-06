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
const yayInstall = (...x) => installRun(`yay -S --needed --noconfirm ${x.join(' ')}`, x)

const isOsx = /^darwin/.test(process.platform);
exports.isOsx = isOsx;
const isArch = process.platform == 'linux' && fs.existsSync('/usr/bin/pacman');
exports.isArch = isArch;

const cannotInstall = x =>
  print.err(`Cannot detect OS to install ${x}`) &&
  shell.exit(1)
const package = 
  isOsx ? brewInstall :
  isArch ? yayInstall :
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
  if(dst.startsWith(os.homedir()))
    return shell.cp('-R', srcp, dst)
  else
    return run(`sudo cp ${srcp} ${dst}`)
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

const inObject = (item, obj) => {
  // if both are null we are done
  if(item == null && obj == null) return true;
  // this edge-case is just invalid
  if(item == null || obj == null) return false;
  if(!item instanceof Object || !obj instanceof Object) return false;
  // check all fields of item and their values in obj
  let notEq = Object.keys(item).find(k => obj[k] !== item[k])
  return !notEq;
}

const ensureJson = (path, j) => {
  try {
    c = readFile(path, '')
    org = JSON.parse(c)
  } catch(err) {
    console.log(`Failed to read JSON in ${path} :`)
    console.log(err)
    return
  }

  if(Array.isArray(j)) {
    j.forEach(item => {
      if(item == null) return;
      console.log(JSON.stringify(org))
      let found = org.find(ci => inObject(item, ci))
      if(!found) org = org.concat(item);
    })
  }

  for(key in j) org[key] = j[key]
  res = JSON.stringify(org, null, 2)
  install(`json ${path}`, () => c !== res, () => writeFile(path, res))
}


// OSX
exports.installOsxBase = () => {
  installCmd('zsh')
  installCmd('git')
  //installCmd('the_silver_searcher', 'ag')
}

// Arch
const resolution = '1920x1200'
exports.installArchBoot = () => {
  package(
    // ui basics
    'xorg', 'lightdm', 'mesa-libgl', 'lightdm-slick-greeter', 'lightdm-settings',
    'gnome-keyring', 'arc-gtk-theme',
    // i3
    'i3', 'xfce4-terminal', 'picom', 'rofi', 'rofimoji', 'xdotool', 'dunst',
    'gnome-settings-daemon', 'feh', 'udiskie', 'android-tools',
    // web
    'networkmanager', 'network-manager-applet',
    'firefox', 'chromium',
    // productivity
    //'gimp', 'telegram-desktop-bin', 'slack-desktop',
    'gthumb', 'gnome-screenshot', 'zathura', 'zathura-pdf-mupdf', 'zathura-cb', 'mediainfo',
    'docker',
  )

  configureLightdm = () => {
    p = '/etc/lightdm/lightdm.conf'
    c = fs.readFileSync(p, 'utf-8')
    c = c.replace(/^#?greeter-session=.*/m, 'greeter-session=lightdm-slick-greeter')
    syncFiles('xrandr.resize', '/usr/local/bin/xrandr.resize')
    c = c.replace(/^#?display-setup-script=.*/m, `display-setup-script=xrandr.resize`)
    c = c.replace(/^#?user-session=.*/m, `user-session=i3`)
    fs.writeFileSync('/tmp/lightdmconf', c)
    run(`sudo mv /tmp/lightdmconf ${p}`)
  }
  install('configure lightdm', false, configureLightdm)
  run('sudo systemctl enable lightdm')
  run('sudo systemctl enable NetworkManager')
  run('sudo systemctl enable docker')
  run('sudo systemctl start docker')

  run('sudo ln -sf /usr/lib/systemd/scripts/ /etc/init.d')
  run('sudo touch /etc/X11/xorg.conf')
  run('sudo ln -sf /usr/bin/python2 /usr/local/bin/python')
  installParallelsTools = () => {
    console.error("Please install parallels tools manually!")
  }
  install('parallels-tools', () => fs.existsSync('/usr/lib/parallels-tools/version'), () => installParallelsTools())

  syncFiles('inco.desktop', '/usr/share/applications/inco.desktop')
}

// Arch core
exports.installArchCore = () => {
  const installYay = () => {
    run("pacman -S --noconfirm git sudo base-devel")
    run("useradd builduser -m && passwd -d builduser && echo 'builduser ALL=(ALL) ALL' >> /etc/sudoers && echo 'root ALL=(ALL) ALL' >> /etc/sudoers")
    run("sudo -u builduser bash -c 'git clone https://aur.archlinux.org/yay.git /tmp/yay && cd /tmp/yay && makepkg -si --noconfirm'")
  }
  install('yay', () => fs.existsSync('/usr/bin/yay'), installYay)

  package(
    // basics
    'git', 'diff-so-fancy', 'vim', 'vim-surround', 'curl', 'htop', 'p7zip', 'encfs',
    'openssh', 'sshfs', 'tree', 'net-tools', 'termdown',
    // deps for parallels tools
    'base-devel', 'python2', 'nodejs', 'npm', 'yarn', 'python-pip',
    // cli tools
    'zsh', 'the_silver_searcher', 'jq', 'yq', 'ttf-inconsolata',
    'bat', 'fzf', 'ripgrep',
    // productivity
    'go', 'imagemagick', 'graphicsmagick', 'maim', 'xclip',
    // configurables
    'code', 'meld', 'colordiff', 'httpie', 'protobuf', 'rsync',
    'inotify-tools', 'yt-dlp', 'x265', 'mpv', 'alsa-utils',
    'vorbis-tools', 'opus-tools', 'advcpmv'
  )

  ensureLines("/etc/locale.conf", "LANG=en_US.utf8")
  ensureLines("/etc/locale.gen", "en_US.UTF-8 UTF-8")
  run("sudo locale-gen")

  ensureLines("/etc/security/limits.conf", "* hard core 0")
  syncFiles('coredump.conf', '/etc/systemd/coredump.conf.d/custom.conf')
  install('inco', () => fs.existsSync('/usr/local/bin/inco'), () => syncFiles('inco.sh', '/usr/local/bin/inco'))
  install('gsa', () => fs.existsSync('/usr/local/bin/gsa'), () => syncFiles('gsa.sh', '/usr/local/bin/gsa'))
  install('gsac', () => fs.existsSync('/usr/local/bin/gsac'), () => syncFiles('gsac.sh', '/usr/local/bin/gsac'))
  install('reco', () => fs.existsSync('/usr/local/bin/reco'), () => syncFiles('reco.sh', '/usr/local/bin/reco'))
  install('recoa', () => fs.existsSync('/usr/local/bin/recoa'), () => syncFiles('recoa.sh', '/usr/local/bin/recoa'))
  install('ylater', () => fs.existsSync('/usr/local/bin/ylater'), () => syncFiles('ylater.sh', '/usr/local/bin/ylater'))
  install('ylaterw', () => fs.existsSync('/usr/local/bin/ylaterw'), () => syncFiles('ylaterw.sh', '/usr/local/bin/ylaterw'))
  install('ylaterhq', () => fs.existsSync('/usr/local/bin/ylaterhq'), () => syncFiles('ylaterhq.sh', '/usr/local/bin/ylaterhq'))
}

exports.configureZshrc = () => {
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

  c = fs.readFileSync(zshrc, 'utf-8')
  c = c.replace(/ZSH_THEME=.*/, 'ZSH_THEME="zero-dark"')
  c = c.replace(/^plugins=\((.+[\s\S])+\)/m, 'plugins=(git zero)')
  ensure = x => { if(!c.includes(x)) c += "\n"+x; }
  ensure('export GOPATH=/pub/go')
  ensure('export $(gnome-keyring-daemon -s)')
  ensure('PATH=/pub/go/bin:$PATH')
  ensure('alias b="bundle exec"')
  ensure('alias ya="yt-dlp -f bestaudio --audio-quality 0 -i -x --extract-audio"')
  ensure('alias yav="yt-dlp -f bestvideo+bestaudio --audio-quality 0 -i --merge-output-format mkv"')
  ensure('alias y="yay --color auto"')
  ensure('alias findlarge="find . -type f -exec du -h {} + | sort -h"')
  ensure("alias yaml2json=\"python3 -c 'import sys; import yaml; import json; json.dump(yaml.safe_load(sys.stdin.read(-1)), sys.stdout)'\"")
  ensure('v2a() { ffmpeg -i "$1" -vn -acodec libvorbis -q:a 6 "#1".ogg }')
  ensure('v2mp4() { ffmpeg -i "$1" -c:v libx264 -c:a copy "$1".mp4 }')
  ensure('alias mpvs="mpv --speed=2.5 -af=scaletempo=stride=16:overlap=.68:search=20"')
  ensure('alias battery="cat /sys/class/power_supply/BAT0/capacity"')
  fs.writeFileSync(zshrc, c)
}

exports.installCore = () => {
  // UI configs
  // Gtk config with dark color theme
  const gtkVariant = 'dark'
  const gtk2confPath = path.join(os.homedir(), '.gtkrc-2.0')
  const gtk3confPath = path.join(os.homedir(), '.config/gtk-3.0/settings.ini')
  install('gtk2 config', false, () => syncFile('gtk2settings.'+gtkVariant+'.ini', gtk2confPath))
  install('gtk3 config', false, () => syncFile('gtk3settings.'+gtkVariant+'.ini', gtk3confPath))

  // gnome-screenshots autosave location to ~/Screenshots
  screenspath = path.join(os.homedir(), "Screenshots")
  install('~/Screenshots', () => fs.existsSync(screenspath), () => run(`mkdir ${screenspath}`))
  run('gsettings set org.gnome.gnome-screenshot auto-save-directory "file:///home/$USER/Screenshots/"')

  // i3
  const configureI3 = () => syncFiles('i3.config', path.join(os.homedir(), '.i3/config'))
  install('i3-config', false, configureI3)

  // rofi
  const configureRofi = () => {
    syncFiles('rofi/config.rasi', path.join(os.homedir(), '.config/rofi/config.rasi'))
    syncFiles('rofi/zero.rasi', path.join(os.homedir(), '.config/rofi/zero.rasi'))
  }
  install('rofi-config', false, configureRofi)

  // picom
  const configurePicom = () => syncFiles('picom.conf', path.join(os.homedir(), '.config/picom.conf'))
  install('picom conf', false, configurePicom)

  // terminal
  const configureTerm = () => syncFiles('xfce4terminal.rc', path.join(os.homedir(), '.config/xfce4/terminal/terminalrc'))
  install('xfce4-terminal', false, configureTerm)

  // international input
  package('fcitx5', 'fcitx5-configtool', 'fcitx5-qt', 'fcitx5-gtk', 'fcitx5-mozc', 'fcitx5-hangul')

  // zero tools
  toolsHome = path.join(os.homedir(), '.zero.tools')
  syncFiles('zero.tools', toolsHome)
  run([
    'cd '+toolsHome,
    'yarn',
    // and install
    'sudo ln -s $(pwd)/normalize.names.js /usr/local/bin/normalize.names'
  ].join(' && '))
}

exports.installDevEnv = () => {
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
    if(o.name == 'Your Name') o.name = '';
    o.name = process.env.GIT_USER_NAME || o.name
    o.email = process.env.GIT_USER_EMAIL || o.email
    if(o.name == '' || o.email == '') gitconfSettings()
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
    'ms-vscode.go',
    'zxh404.vscode-proto3',
    'dbaeumer.vscode-eslint',
    'HookyQR.beautify',
    'BriteSnow.vscode-toggle-quotes',
    'PeterJausovec.vscode-docker',
    'esbenp.prettier-vscode',
    'passionkind.prettier-vscode-with-tabs',
    'adpyke.codesnap',
    'bierner.lit-html',
    'bierner.emojisense',
    'wayou.vscode-todo-highlight',
    'wix.vscode-import-cost',
    'fabiospampinato.vscode-todo-plus',
    'github.github-vscode-theme'
  )

  ensureJson(path.join(os.homedir(), '.config/Code - OSS/User/settings.json'),
    {
      "go.formatTool": "goimports",
      "vim.useCtrlKeys": true,
      "vim.overrideCopy": false,
      "vim.autoindent": true,
      "vim.surround": true,
      "vim.handleKeys": {
        "<C-c>": false,
        "<C-x>": false,
        "<C-v>": false,
        "<C-f>": false,
        "<C-w>": false,
        "<C-d>": false,
        "<C-h>": false,
      },
      "vim.insertModeKeyBindings": [
        {
          "before": [
            "k", "j",
          ],
          "after": [
            "<Esc>"
          ]
        },
        {
          "before": [
            "j", "k",
          ],
          "after": [
            "<Esc>"
          ]
        }
      ],
      "editor.rulers": [
        80,
      ],
      "editor.tabSize": 2,
      "editor.insertSpaces": true,
      "go.toolsEnvVars": {
        "GO111MODULE": "on",
      },
      "emojisense.languages": {
        "markdown": true,
        "plaintext": {
          "markupCompletionsEnabled": false,
          "emojiDecoratorsEnabled": false
        },
        "git-commit": true,
        "go": true,
        "javascript": true,
        "json": true,
        "yaml": true,
        "html": true,
        "typescript": true,
      },
      "go.useLanguageServer": true,
      "go.toolsManagement.autoUpdate": true,
      "nightswitch.themeDay": "GitHub Light Default",
      "nightswitch.themeNight": "Default Dark+",
      "nightswitch.location": "",
      "nightswitch.autoSwitch": false,
      "workbench.colorTheme": "Default Dark+",
    }
  )

  ensureJson(path.join(os.homedir(), '.config/Code - OSS/User/keybindings.json'),
    [
      {
        "key": "alt+d",
        "command": "editor.action.goToDeclaration",
        "when": "editorHasDefinitionProvider && editorTextFocus && !isInEmbeddedEditor"
      },
      {
        "key": "f12",
        "command": "-editor.action.goToDeclaration",
        "when": "editorHasDefinitionProvider && editorTextFocus && !isInEmbeddedEditor"
      },
      {
        "key": "alt+d",
        "command": "todo.toggleDone",
        "when": "editorTextFocus && editorLangId == 'todo'"
      },
      {
        "key": "alt+d",
        "command": "-todo.toggleDone",
        "when": "editorTextFocus && editorLangId == 'todo'"
      },
      {
        "key": "alt+c",
        "command": "todo.toggleCancelled",
        "when": "editorTextFocus && editorLangId == 'todo'"
      },
      {
        "key": "alt+c",
        "command": "-todo.toggleCancelled",
        "when": "editorTextFocus && editorLangId == 'todo'"
      },
      {
        "key": "alt+s",
        "command": "todo.start",
        "when": "editorTextFocus && editorLangId == 'todo'"
      },
      {
        "key": "alt+s",
        "command": "-todo.start",
        "when": "editorTextFocus && editorLangId == 'todo'"
      },
      {
        "key": "alt+a",
        "command": "todo.archive",
        "when": "editorTextFocus && editorLangId == 'todo'"
      },
      {
        "key": "ctrl+shift+a",
        "command": "-todo.archive",
        "when": "editorTextFocus && editorLangId == 'todo'"
      },
      {
        "key": "ctrl+pagedown",
        "command": "workbench.action.nextEditor"
      },
      {
        "key": "ctrl+pageup",
        "command": "workbench.action.previousEditor"
      },
      {
        "key": "ctrl+a",
        "command": "editor.action.selectAll"
      }
    ]
  )

  // Go
  install('goimports', () => commandExists('goimports'), () => run('go get golang.org/x/tools/cmd/goimports'))
  install('dep', () => commandExists('dep'), () => run('go get -u github.com/golang/dep/cmd/dep'))
  install('protoc', false, () => commandExists('go get -u github.com/golang/protobuf/protoc-gen-go'))

  // NodeJS
  run('yarn global add dom-parser')
}
