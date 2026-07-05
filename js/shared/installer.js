import shell from 'shelljs';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {
  print, run, runq, commandExists,
  gitEnsure, packages, install, installCmd,
  syncFile, syncFiles, writeFile, ensureLines,
  ensureClaudePermissions, ensureJson,
} from './lib.js';

// OSX
export const installOsxBase = () => {
  installCmd('zsh')
  installCmd('git')
  //installCmd('the_silver_searcher', 'ag')
}

// Arch
const resolution = '1920x1200'
export const installArchBoot = () => {
  packages(
    // filesystems
    'btrfs-progs',
    // networking
    'iwd', 'iw', 'dhcpcd',
    // bluetooth
    'bluez', 'bluetui',
  )

  // Why not NetworkManager?
  // It's a great alternative, but I found it pulls other dependencies like
  // wpa_supplicant that all overlapped with existing services.
  // For UI-based config and applets its better and recommended, but you
  // should install it with iwd backend if you keep iwd around.
  //
  // 'networkmanager', 'network-manager-applet', 'networkmanager-iwd',

  run('sudo ln -sf /usr/lib/systemd/scripts/ /etc/init.d')
  syncFiles('inco.desktop', '/usr/share/applications/inco.desktop')
}

export const installContainerRuntime = (username) => {
  packages(
    'docker', 'docker-rootless-extras',
  )
  // For regular root-based docker service:
  // run('sudo systemctl enable docker')
  // run('sudo systemctl start docker')

  if(username == null || username == "") {
    console.log("WARNING: Missing username for rootless docker setup, please run this again as a regular user")
    return
  }
  if(username == 'root') {
    console.log("WARNING: Won't complete setup for rootless docker, please run this again as a regular user")
    return
  }

  // We go for rootless for more security:
  writeFile('/etc/subuid', username + ':100000:65536')
  writeFile('/etc/subgid', username + ':100000:65536')

  run('systemctl --user enable docker.service')
  run('docker context create rootless --description "Rootless mode" --docker "host=unix:///run/user/$(id -u)/docker.sock"')
  run('docker context use rootless')
  run('systemctl --user start docker.service')
}

const useWayland = true

// Arch core
export const installArchCore = () => {
  const installYay = () => {
    run("pacman -S --noconfirm git sudo base-devel")
    run("useradd builduser -m && passwd -d builduser && echo 'builduser ALL=(ALL) ALL' >> /etc/sudoers && echo 'root ALL=(ALL) ALL' >> /etc/sudoers")
    run("sudo -u builduser bash -c 'git clone https://aur.archlinux.org/yay.git /tmp/yay && cd /tmp/yay && makepkg -si --noconfirm'")
  }
  install('yay', () => fs.existsSync('/usr/bin/yay'), installYay)

  if(useWayland) {
    packages(
      'sway', 'swaybg', 'swayidle', 'swaylock', 'swaync', // or mako
      'xdg-desktop-portal', 'xdg-desktop-portal-wlr', 'xdg-desktop-portal-gtk', // screen-share/screenshot/file-picker
      'aur/xdg-desktop-portal-termfilechooser', // file-picker using yazi; can also do gtk/gnome
      'xwayland-satellite',
      // helpers
      'grim', 'slurp', 'wl-clipboard', 'wtype',
    )

    const configureSway = () => syncFiles('sway.config', path.join(os.homedir(), '.config/sway/config'))
    install('sway-config', false, configureSway)

    // xdg-desktop-portal: route ScreenCast/Screenshot to wlr backend, with slurp as the output picker.
    // Requires sway.config to export WAYLAND_DISPLAY to systemd via dbus-update-activation-environment.
    const configurePortals = () => {
      syncFiles('xdg-desktop-portal.sway-portals.conf', path.join(os.homedir(), '.config/xdg-desktop-portal/sway-portals.conf'))
      syncFiles('xdg-desktop-portal-wlr.config', path.join(os.homedir(), '.config/xdg-desktop-portal-wlr/config'))
    }
    install('xdg-desktop-portal-config', false, configurePortals)

  } else {
    packages(
      'xorg', 'lightdm', 'lightdm-slick-greeter', 'lightdm-settings',
      'i3', 'picom', 'feh', 'dunst',
      // helpers
      'xclip', 'maim', 'xdotool',
    )

    // i3
    const configureI3 = () => syncFiles('i3.config', path.join(os.homedir(), '.config/i3/config'))
    install('i3-config', false, configureI3)

    // picom
    const configurePicom = () => syncFiles('picom.conf', path.join(os.homedir(), '.config/picom.conf'))
    install('picom conf', false, configurePicom)

    const configureLightdm = () => {
    const p = '/etc/lightdm/lightdm.conf'
    let c = fs.readFileSync(p, 'utf-8')
    c = c.replace(/^#?greeter-session=.*/m, 'greeter-session=lightdm-slick-greeter')
    syncFiles('xrandr.resize', '/usr/local/bin/xrandr.resize')
    c = c.replace(/^#?display-setup-script=.*/m, `display-setup-script=xrandr.resize`)
    c = c.replace(/^#?user-session=.*/m, `user-session=i3`)
    fs.writeFileSync('/tmp/lightdmconf', c)
      run(`sudo mv /tmp/lightdmconf ${p}`)
    }
    install('configure lightdm', false, configureLightdm)
    run('sudo systemctl enable lightdm')
    run('sudo touch /etc/X11/xorg.conf')
  }

  packages(
    // ui basics
    'mesa-libgl', 'gnome-keyring', 'arc-gtk-theme',
    'kitty', // or alacritty; kitty has a nice image protocol, works with yazi
    'yazi', // terminal file picker with preview
    'rofi', 'rofimoji', 'dunst',
    'gnome-settings-daemon', 'udiskie', 'android-tools', 'dmidecode',
  )

  packages(
    // basics
    'git', 'just', 'diff-so-fancy', 'curl', 'htop', 'p7zip', 'encfs', 'pwgen',
    'openssh', 'sshfs', 'tree', 'net-tools', 'termdown', 'renameutils',
    'rclone', 'claude-code', 'openai-codex', 'github-cli',
    // OS foundation
    'zram-generator',
    // deps for dev
    'base-devel', 'pnpm', 'python-pip',
    // editor
    'vim', 'neovim', 'vim-surround', 'glow', 'visidata',
    // cli tools
    'the_silver_searcher', 'jq', 'yq', 'ttf-inconsolata',
    'bat', 'fzf', 'ripgrep',
    // productivity
    'go', 'imagemagick', 'graphicsmagick',
    'code', 'meld', 'colordiff', 'httpie', 'protobuf',
    // files / drive
    'gdu', 'rsync', 'gdrive',
    // audio config
    'pipewire', 'pavucontrol', 'rtkit', 'realtime-privileges',
    // video-tools
    'inotify-tools', 'yt-dlp', 'x265', 'mpv', 'alsa-utils',
    'mkvtoolnix-cli', 'ffmpeg',
    'vorbis-tools', 'opus-tools', 'advcpmv',
    'obs-studio', 'wlrobs', // wlrobs = obs plugin for wayland
    // fonts
    'noto-fonts', 'noto-fonts-emoji', 'noto-fonts-extra', 'noto-fonts-cjk',
    // web
    'firefox', 'chromium',
    // productivity
    'gthumb', 'gnome-screenshot', 'zathura', 'zathura-pdf-mupdf', 'zathura-cb', 'mediainfo',
    // comms
    'discord', 'slack-desktop', 'telegram-desktop',
  )

  // out of memory protection, kills cgroups before the kernel locks up
  run('sudo systemctl enable --now systemd-oomd')

  // zram-swap: compressed in-RAM swap gives the kernel reclaim headroom so
  // OOM can fire cleanly instead of stalling. The config is read by the
  // zram-generator systemd-generator; no `systemctl enable` is needed -- the
  // generated dev-zram0.swap unit is pulled into swap.target on every boot.
  // daemon-reload reruns generators; start the unit so zram is live without
  // requiring a reboot.
  syncFiles('zram-generator.conf', '/etc/systemd/zram-generator.conf')
    .changed(() => run('sudo systemctl daemon-reload && sudo systemctl start systemd-zram-setup@zram0.service'))

  // Disk swapfile as overflow for the rare case zram is exhausted (e.g. heavy
  // Rust/C++ compiles on third-party projects whose -j we don't control).
  // Priority 10 keeps it strictly below zram (100): kernel fills zram first,
  // only spills here when zram is full. Assumes ext4; on btrfs use a different
  // creation path (chattr +C / btrfs filesystem mkswapfile).
  const swapfile = '/swapfile'
  install(`swapfile ${swapfile}`, () => fs.existsSync(swapfile), () => run([
    `sudo fallocate -l 16G ${swapfile}`,
    `sudo chmod 600 ${swapfile}`,
    `sudo mkswap ${swapfile}`,
    `sudo swapon -p 10 ${swapfile}`,
  ].join(' && ')))
  ensureLines('/etc/fstab', `${swapfile} none swap defaults,pri=10 0 0`)

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

  syncFiles('mimeapps.list', path.join(os.homedir(), '.config/mimeapps.list'))
  syncFiles('kitty.conf', path.join(os.homedir(), '.config/kitty/kitty.conf'))
  syncFiles('kitty.no-preference-theme.auto.conf', path.join(os.homedir(), '.config/kitty/no-preference-theme.auto.conf'))

  // fontconfig: force JP glyphs for shared CJK kanji in untagged apps
  syncFiles('69-language-selector-ja.conf', path.join(os.homedir(), '.config/fontconfig/conf.d/69-language-selector-ja.conf'))
    .changed(() => run('fc-cache -fr'))

  syncFiles('obstoggle', '/usr/local/bin/obstoggle')
}

export const configureZsh = () => {
  packages('zsh')

  // ZSH
  const zshrc = path.join(os.homedir(), '.zshrc')
  const defaultZsh = () => run('chsh -s /bin/zsh')
  //install('zsh-default', () => process.env.SHELL == '/bin/zsh', defaultZsh)
  const installOhMyZsh = () => {
    gitEnsure('https://github.com/robbyrussell/oh-my-zsh.git', path.join(os.homedir(), '.oh-my-zsh'))
    if(!fs.existsSync(zshrc))
      shell.cp("~/.oh-my-zsh/templates/zshrc.zsh-template", zshrc)
    return run('curl https://raw.githubusercontent.com/arlimus/zero.zsh/master/bootstrap.sh | sh -')
  }
  install('oh-my-zsh', false, installOhMyZsh)

  let c = fs.readFileSync(zshrc, 'utf-8')
  c = c.replace(/ZSH_THEME=.*/, 'ZSH_THEME="zero-dark"')
  c = c.replace(/^plugins=\((.+[\s\S])+\)/m, 'plugins=(git zero)')
  ensure = x => { if(!c.includes(x)) c += "\n"+x; }

  ensure('export GTK_IM_MODULE=fcitx')
  ensure('export QT_IM_MODULE=fcitx')
  ensure('export XMODIFIERS=@im=fcitx')
  ensure('export SSH_AUTH_SOCK="${XDG_RUNTIME_DIR}/ssh-agent.socket"')

  ensure('export GOPATH=/pub/go')
  ensure('export $(gnome-keyring-daemon -s)')
  ensure('PATH=/pub/go/bin:$PATH')
  ensure('alias b="bundle exec"')
  ensure('alias ya="yt-dlp -f bestaudio --audio-quality 0 -i -x --extract-audio"')
  ensure('alias y="yay --color auto"')
  ensure('alias findlarge="find . -type f -exec du -h {} + | sort -h"')
  ensure("alias yaml2json=\"python3 -c 'import sys; import yaml; import json; json.dump(yaml.safe_load(sys.stdin.read(-1)), sys.stdout)'\"")
  ensure('v2a() { ffmpeg -i "$1" -vn -acodec libvorbis -q:a 6 "#1".ogg }')
  ensure('v2mp4() { ffmpeg -i "$1" -c:v libx264 -c:a copy "$1".mp4 }')
  ensure('alias mpvs="mpv --speed=2.5 -af=scaletempo=stride=16:overlap=.68:search=20"')
  ensure('alias battery="cat /sys/class/power_supply/BAT0/capacity"')
  fs.writeFileSync(zshrc, c)
}

export const installCore = () => {
  // UI configs
  // Gtk config with dark color theme
  const gtkVariant = 'dark'
  const gtk2confPath = path.join(os.homedir(), '.gtkrc-2.0')
  const gtk3confPath = path.join(os.homedir(), '.config/gtk-3.0/settings.ini')
  install('gtk2 config', false, () => syncFile('gtk2settings.'+gtkVariant+'.ini', gtk2confPath))
  install('gtk3 config', false, () => syncFile('gtk3settings.'+gtkVariant+'.ini', gtk3confPath))

  // gnome-screenshots autosave location to ~/Screenshots
  const screenspath = path.join(os.homedir(), "Screenshots")
  install('~/Screenshots', () => fs.existsSync(screenspath), () => run(`mkdir ${screenspath}`))
  run('gsettings set org.gnome.gnome-screenshot auto-save-directory "file:///home/$USER/Screenshots/"')

  // rofi
  const configureRofi = () => {
    syncFiles('rofi/config.rasi', path.join(os.homedir(), '.config/rofi/config.rasi'))
    syncFiles('rofi/zero.rasi', path.join(os.homedir(), '.config/rofi/zero.rasi'))
  }
  install('rofi-config', false, configureRofi)

  // international input
  packages('fcitx5', 'fcitx5-configtool', 'fcitx5-qt', 'fcitx5-gtk', 'fcitx5-mozc', 'fcitx5-hangul')
  // fcitx5 autostart is wired via `exec fcitx5 -d --replace` in sway.config so it
  // inherits WAYLAND_DISPLAY — required for native-Wayland apps (kitty, Electron)
  // to reach fcitx5 via the input-method-v2 protocol. GTK/Qt apps go over DBus
  // and work regardless, but text-input-v3 clients do not.
  // VSCode/Electron also needs explicit flags to use text-input-v3:
  syncFile('code-flags.conf', path.join(os.homedir(), '.config/code-flags.conf'))

  // zero tools
  const toolsHome = path.join(os.homedir(), '.zero.tools')
  syncFiles('zero.tools', toolsHome)
  run([
    'cd '+toolsHome,
    'pnpm i',
    // and install
    // Symlink the env.nvm wrapper (not env.nvm.sh) onto the PATH. The wrapper
    // just prints env.nvm.sh's path so callers `source $(env.nvm)` it into
    // their own shell — symlinking the .sh directly would run `nvm use` in a
    // throwaway subshell, leaving the caller's Node version unchanged. This
    // also replaces the old zsh-only env.nvm() function from zshrc.
    'sudo ln -s $(pwd)/env.nvm /usr/local/bin/env.nvm',
    'sudo ln -s $(pwd)/normalize.names.js /usr/local/bin/normalize.names',
    'sudo ln -s $(pwd)/mextract.py /usr/local/bin/mextract',
    'sudo ln -s $(pwd)/yav.sh /usr/local/bin/yav',
  ].join(' && '))
}

export const installDevEnv = (name, email) => {
  // ssh config
  const sshconfPath = path.join(os.homedir(), '.ssh/config')
  syncFile('user_ssh_config', sshconfPath)
  run('systemctl --user enable --now ssh-agent')

  // Gitconfig
  const gitconfPath = path.join(os.homedir(), '.gitconfig')
  const gitconfSet = x => {
    run(`git config --global user.name "${x.name}"`)
    run(`git config --global user.email "${x.email}"`)
  }
  const installGitconf = () => {
    ;
    syncFile('gitconfig', gitconfPath)
    let changed = false
    if(name != '' && name != o.name) {
      o.name = name;
      changed = true;
    }
    if(email != '' && email != o.email) {
      o.email = email;
      changed = true;
    }
    if(changed) gitconfSet(o);
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
    // 'vscodevim.vim',
    'asvetliakov.vscode-neovim',
    'ms-vscode.go',
    'zxh404.vscode-proto3',
    'dbaeumer.vscode-eslint',
    'HookyQR.beautify',
    'PeterJausovec.vscode-docker',
    'prettier.prettier-vscode',
    'adpyke.codesnap',
    'bierner.emojisense',
    'wayou.vscode-todo-highlight',
    'wix.vscode-import-cost',
    'fabiospampinato.vscode-todo-plus',
    'github.github-vscode-theme'
  )

  // Claude Code plugins
  const claudeMarketplaces = runq('claude plugin marketplace list').stdout.toString().trim().split(/\r?\n/)
  const claudeMarketplace = (...x) =>
    x.forEach(y => install(`claude marketplace: ${y}`, () => claudeMarketplaces.some(l => l.includes(y)), () => run(`claude plugin marketplace add ${y}`)))

  claudeMarketplace(
    'anthropics/claude-code',
  )

  const claudeExist = runq('claude plugin list').stdout.toString().trim().split(/\r?\n/)
  const claudePlugins = (...x) =>
    x.forEach(y => install(`claude: ${y}`, () => claudeExist.some(l => l.includes(y)), () => run(`claude plugin install ${y}`)))

  claudePlugins(
    'frontend-design@claude-plugins-official',
    'gopls-lsp@claude-plugins-official',
    'typescript-lsp@claude-plugins-official',
  )

  // Claude Code skills (after claude-code is installed so ~/.claude/skills is the right place)
  // Installer is source-of-truth: dst is wiped before copy so re-runs converge on files/skills/<name>.
  const claudeSkillsDir = path.join(os.homedir(), '.claude/skills')
  const installClaudeSkill = (name) => {
    const src = path.join('files/skills', name)
    const dst = path.join(claudeSkillsDir, name)
    shell.mkdir('-p', claudeSkillsDir)
    shell.rm('-rf', dst)
    if(shell.cp('-Rf', src, dst).code !== 0) {
      print.err(`Failed to install claude skill: ${name}`)
      return
    }
    // Restore +x on any shell scripts in case git lost the bit
    shell.find(dst)
      .filter(f => f.endsWith('.sh'))
      .forEach(f => shell.chmod('+x', f))
    print.ok(`claude skill: ${name}`)
  }
  installClaudeSkill('youtube-summary')
  installClaudeSkill('process-pr-comments')

  // Permissions the skills need (read its cache, save summaries, and run each
  // fetch.sh with any argument — the literal-string match would only cover one
  // set of args, so use the :* wildcard instead).
  const home = os.homedir()
  ensureClaudePermissions([
    `Read(${home}/.cache/claude-youtube-summary/**)`,
    `Write(${home}/.cache/youtube-summaries/**)`,
    `Bash(${home}/.claude/skills/youtube-summary/fetch.sh:*)`,
    `Bash(${home}/.claude/skills/process-pr-comments/fetch.sh:*)`,
  ])

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
  install('protoc', false, () => commandExists('go get -u github.com/golang/protobuf/protoc-gen-go'))
}

export const installAmdGraphics = () => {
  const configureMultilib = () => {
    const p = '/etc/pacman.conf'
    let c = fs.readFileSync(p, 'utf-8')
    c = c.replace(/^#?\[multilib\].*\n#?.*/m, '[multilib]\nInclude = /etc/pacman.d/mirrorlist')
    fs.writeFileSync('/etc/pacman.conf', c)
  }
  install('configure multilib', false, configureMultilib)

  packages(
    'lib32-mesa', 'xf86-video-amdgpu', 'vulkan-radeon',
  )
}

export const installAsServer = () => {
  syncFile('udev.no-powersave.rules', '/etc/udev/rules.d/81-wifi-powersave.rules')
}
