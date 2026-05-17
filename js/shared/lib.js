#!/usr/bin/env node
import * as chalk from 'chalk';
import shell from 'shelljs';
import { spawnSync } from 'child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as process from 'node:process';

const color = {
  cmd: chalk.default.blue,
  ok: chalk.default.green,
  err: chalk.default.red,
  info: chalk.default.cyan,
}
export const print = {
  ok: x => console.log(color.ok('[ok] '+x)),
  add: x => console.log(color.ok(x)),
  err: x => console.log(color.err(x)),
  fatal: x => { console.log(color.err(x)); process.exit(1) },
  cmd: x => console.log(color.cmd(x)),
  info: x => console.log(color.info(x)),
}

export const runq = x => spawnSync('bash', ['-c', x])
export const run = x => {
  print.cmd(`----> ${x}`)
  return shell.exec(x)
}
export const commandExists = x => spawnSync('command',['-v', x]).status == 0

const gitClone = (src, dst) => run(`git clone ${src} ${dst}`)
export const gitEnsure = (src, path) => {
  if(!fs.existsSync(path)) gitClone(src, path);
  return run(`cd ${path} && git fetch --all && git pull`)
}

const installRun = (cmd, list) => {
  const res = run(cmd)
  if(res.status == 0) {
    print.ok(`Installation ${list} successful`);
    return true;
  }
  print.err(`Failed to install ${list}: ${res.stderr}`);
  return false;
}
const brewInstall = x => installRun(`brew install ${x.join(' ')}`, x)
const yayInstall = (...x) => installRun(`yay -S --needed --noconfirm ${x.join(' ')}`, x)

export const isOsx = /^darwin/.test(process.platform);
export const isArch = process.platform == 'linux' && fs.existsSync('/usr/bin/pacman');

const cannotInstall = x =>
  print.err(`Cannot detect OS to install ${x}`) &&
  shell.exit(1)
export const packages =
  isOsx ? brewInstall :
  isArch ? yayInstall :
  cannotInstall

export const install = (what, exists, installF) => {
  if(exists === false || !exists()) installF()
  print.ok(`${what}`);
}
export const installCmd = (what, test = null) =>
  (test == null) ? installCmd(what, () => commandExists(what)) :
  (typeof test === 'string') ? installCmd(what, () => commandExists(test)) :
  install(what, test, () => packages(what))
// Chain returned by syncFile/syncFiles. `.changed(fn)` runs fn only if the
// destination actually differed from the source (or the sync failed to verify).
const noopChain = { changed: () => noopChain }
const syncChain = (didChange) => {
  const c = { changed: fn => { if(didChange) fn(); return c } }
  return c
}
const safeRead = p => { try { return fs.readFileSync(p) } catch(e) { return null } }

export const syncFile = (src, dst) => {
  const srcp = path.join('files', src);
  if(!fs.existsSync(srcp)) {
    print.err(`Cannot find source file in ${srcp}`)
    return noopChain
  }
  console.log(`${srcp} -> ${dst}`)
  const before = safeRead(dst)
  const r = shell.cp(srcp, dst)
  if(r.code !== 0) return noopChain
  const after = safeRead(dst)
  return syncChain(before == null || after == null || !before.equals(after))
}
export const syncFiles = (src, dst) => {
  const srcp = path.join('files', src);
  if(!fs.existsSync(srcp)) {
    print.err(`Cannot find source file in ${srcp}`)
    return noopChain
  }
  console.log(`${srcp} -> ${dst}`)
  shell.mkdir('-p', path.dirname(dst))
  const srcIsFile = fs.statSync(srcp).isFile()
  const before = srcIsFile ? safeRead(dst) : null
  let ok
  if(dst.startsWith(os.homedir()))
    ok = shell.cp('-R', srcp, dst).code === 0
  else
    ok = run(`sudo cp ${srcp} ${dst}`).code === 0
  if(!ok) return noopChain
  if(!srcIsFile) return syncChain(true) // dir copies: assume changed
  const after = safeRead(dst)
  return syncChain(before == null || after == null || !before.equals(after))
}

export const writeFile = (path, content) => {
  if(path.startsWith(os.homedir()))
    return fs.writeFileSync(path, content)
  // for anything else let's use sudo
  fs.writeFileSync('/tmp/ensurelines', content)
  run(`sudo mv /tmp/ensurelines ${path}`)
}

const readFile = (path, alternative = null) => {
  if(fs.existsSync(path)) return fs.readFileSync(path, 'utf-8')
  if(alternative == null) return print.fatal(`Cannot read file ${path}`)
  return alternative
}

export const ensureLines = (path, ...lines) => {
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

// Merge entries into permissions.allow in ~/.claude/settings.json without
// touching unrelated keys. Idempotent: re-running adds nothing if the entries
// already exist verbatim.
export const ensureClaudePermissions = (allowEntries) => {
  const p = path.join(os.homedir(), '.claude/settings.json')
  const c = readFile(p, '{}')
  let org
  try { org = JSON.parse(c) } catch(err) {
    print.err(`Failed to parse ${p}: ${err}`)
    return
  }
  if(!org.permissions) org.permissions = {}
  if(!Array.isArray(org.permissions.allow)) org.permissions.allow = []
  let changed = false
  allowEntries.forEach(e => {
    if(!org.permissions.allow.includes(e)) {
      org.permissions.allow.push(e)
      print.add(`    > ${p}: + ${e}`)
      changed = true
    }
  })
  if(changed) writeFile(p, JSON.stringify(org, null, 2) + "\n")
  print.ok(`claude permissions in ${p}`)
}

export const ensureJson = (path, j) => {
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

export const GitSettings = () => {
  return {
    name: runq('git config --global user.name').stdout.toString().trim(),
    email: runq('git config --global user.email').stdout.toString().trim(),
  }
}
