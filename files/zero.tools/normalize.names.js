#!/usr/bin/env node
const colors = require('colors/safe');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const glob = require('glob').sync;
var files = process.argv.slice(2)

if(files.length == 0) {
  files = ['.']
}

const sep = '.'
const _s = (len, unit) => '' + len + ' ' + unit + ((len > 1) ? 's' : '')

const rename = (dir, bn, nu_bn) => {
  var nu = path.join(dir, nu_bn)
  var org = path.join(dir, bn)
  if(fs.existsSync(nu)) {
    console.log(colors.red(`Cannot move ${nu_bn} to ${nu}. This file already exists!!`))
    return false;
  } 
  fs.renameSync(org, nu)
  process.stdout.write(colors.green('+'))
}

const pad = (num, size) => ('000000000' + num).substr(-size);

const normName = (x, apply, stats) => {
  var dir = path.dirname(x)
  var bn = path.basename(x)
  var r = bn

  // if the name only separates by _ instead of . we replace all those first
  if(r.match(/\.[^.]+\./) == null) {
    r = r.replace(/[_]+/g, '.')
  }
  r = r.replace(/\x84/g, "ä")
       .replace(/\x81/g, "ü")
       .replace(/\x94/g, "ö")

  // grabbing prefix expressions on some files like: "[nano] file name" => "nano"
  var subex = r.match(/^\[.*?\]/)
  if(subex != null) {
    r = r.replace(/(.*)\./, "$1"+subex[0]+".").slice(subex[0].length)
  }

  r = r.toLowerCase()
  r = r.replace(/\s+/g, sep)
  r = r.replace(/[\[\({]+/g, sep + '-' + sep)
  r = r.replace(/[\]\)!]+/g, sep)
  r = r.replace(/[&$]/g, '+')
  r = r.replace(/['"’]+/g, '')
  r = r.replace(/[—–_]+/g, '-')
  r = r.replace(/-[-]+/g, '-')
  r = r.replace(/-[-]+/g, '-')
  r = r.replace(/\.\.+/g, sep)
  r = r.replace(/\b\.+$/, '')
  r = r.replace(/1280x720/g, '720p')
  r = r.replace(/1920x1080/g, '1080p')
  r = r.replace(/episode\.(\d+)/, (_, x) => 'episode.'+pad(x, 2))
  r = r.replace(/s(\d\d)e(\d\d)/, (_, s, e) => s + '.' + e)
  r = r.replace(/\.opus$/g, '.ogg')

  if(bn != r) r = r.replace(/^[.-]+/, '')

  if(bn == r) {
    if(apply) return process.stdout.write(colors.gray('='))
    if(stats != null) stats.unchanged.push(colors.gray(`${r} (unchanged)`))
  } else {
    if(apply) return rename(dir, bn, r)
    if(stats != null) stats.rename.push(`${colors.blue(bn)}  -->  ${colors.cyan(r)}`)
  }
}
const flatten = x => [].concat.apply([], x.filter(i=>i))
const expandFiles = files => flatten(files.map(x => {
  stat = fs.statSync(x);
  if(stat.isFile()) return x;
  if(!stat.isDirectory()) {
    console.log(colors.red(`Cannot process ${x}, it is not a file nor a directory`))
    return null;
  }
  nu = expandFiles(glob(x + '/*'))
  nu.push(x)
  return nu
}))

const printStats = stats => {
  if(stats == null) return;
  stats.unchanged.forEach(x => console.log(x))
  stats.rename.forEach(x => console.log(x))
}

console.log(colors.green(`Input: ${_s(files.length, 'file')}`))

xfiles = expandFiles(files)
console.log(colors.green(`Expanded files: ${_s(xfiles.length, 'xfiles')}`))

var stats = { rename: [], unchanged: [] }
xfiles.forEach(x => normName(x, false, stats))

printStats(stats)
if(stats.rename.length === 0) {
  console.log("Nothing to rename. We are done.")
  process.exit(0)
}

inquirer.prompt({ type: 'confirm', name: 'rename',
  message: `Do you want to rename these ${stats.rename.length} files? (${stats.unchanged.length} unchanged)`, default: false
}).then(answers => {
  if(!answers.rename) {
    console.log("Aborting.")
    process.exit(0)
  }
  xfiles.forEach(x => normName(x, true))
  console.log(colors.green("All done."))
  process.exit(0)
})
