const colors = require('colors/safe');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const glob = require('glob').sync;
const files = process.argv.slice(2)

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
  process.stdout.write(colors.green('.'))
}

const normNames = (x, apply, stats) => {
  var dir = path.dirname(x)
  var bn = path.basename(x)
  var r = bn.replace(/\s+/g, sep) 
  r = r.replace(/[\[\({]+/g, sep + '-' + sep)
  r = r.replace(/[\]\)!]+/g, sep)
  r = r.replace(/[&$]/g, '+')
  r = r.replace(/['"’]+/g, '')
  r = r.replace(/[—–_]+/g, '-')
  r = r.replace(/-[-]+/g, '-')
  r = r.replace(/-[-]+/g, '-')
  r = r.replace(/\.\.+/g, sep)
  r = r.toLowerCase()
  if(bn == r) {
    if(apply) return process.stdout.write(colors.gray('='))
    console.log(colors.gray(`${r} (unchanged)`))
    if(stats != null) stats.unchanged += 1
  } else {
    if(apply) return rename(dir, bn, r)
    console.log(`${colors.blue(bn)}  -->  ${colors.cyan(r)}`)
    if(stats != null) stats.rename += 1
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

console.log(colors.green(`Input: ${_s(files.length, 'file')}`))

xfiles = expandFiles(files)
console.log(colors.green(`Expanded files: ${_s(xfiles.length, 'xfiles')}`))

var stats = { rename: 0, unchanged: 0 }
xfiles.forEach(x => normNames(x, false, stats))
inquirer.prompt({ type: 'confirm', name: 'rename',
  message: `Do you want to rename these ${stats.rename} files? (${stats.unchanged} unchanged)`, default: false
}).then(answers => {
  if(!answers.rename) {
    console.log("Aborting.")
    process.exit(0)
  }
  xfiles.forEach(x => normNames(x, true))
  console.log(colors.green("All done."))
  process.exit(0)
})