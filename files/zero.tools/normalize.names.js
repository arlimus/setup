#!/usr/bin/env node
const colors = require('colors/safe');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const glob = require('glob').sync;

const Config = {
  mini: false,
  replace: [],
};

const args = process.argv.slice(2);
const files = [];

for(let i = 0; i < args.length; i++) {
  let arg = args[i];
  switch (arg) {
    case '-h':
      console.log("options:")
      console.log("  -mini     ... minify")
      console.log("  -i        ... interactive")
      process.exit()
    case '-r':
      if (i+2 >= args.length) {
        console.log("not enough arguments for replacement, need 2")
      }

      const m = {
        old: args[i+1],
        nu: args[i+2],
      };
      Config.replace.push(m);

      i += 2;
      console.log(`replace "${m.old}" => "${m.nu}"`)
      break;
    case '-mini':
      Config.mini = true;
      break;
    default:
      files.push(args)
  }
}

if(files.length == 0) files.push('.');

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

const minifySuffix = (s) => {
  let suffix = s.match(/\.([^.]+)$/)
  if(suffix == null) return s;

  let encoding = s.match(/x26[45]/)
  let resolution = s.match(/\b(\d+\d\dp)\b/) // 480p, 720p, 1080p, ...
  let language = s.match(/\b(ej)\b/)

  let res = ''
  if(resolution != null) res += resolution[1] + '.';
  if(encoding != null) res += encoding[0] + '.';
  if(language != null) res += language[1] + '.';
  return res + suffix[1]
}

const seasons = {
  spring: 'q1',
  summer: 'q2',
  fall: 'q3',
  winter: 'q4',
}

const months = {
  'january.february': '01+02',
  'march.april': '03+04',
  'may.june': '05+06',
  'july.august': '07+08',
  'september.october': '09+10',
  'november.december': '11+12',
}
const monthsRegex = RegExp('('+Object.keys(months).join('|')+').(\\d\\d\\d\\d)')

const normName = (x, mode, apply, stats) => {
  var dir = path.dirname(x)
  var bn = path.basename(x)
  var r = bn

  // for all partial files we don't want to rename them, as they are still in progress
  if(r.endsWith('.part')) {
    if(stats != null) stats.unchanged.push(colors.yellow(`${r} (unchanged)`))
    return
  }

  // universal things we want
  r = r.toLowerCase()
  // prevent incorrectly encoded characters from showing up
  r = r.replace(/\x84/g, "ä")
       .replace(/\x81/g, "ü")
       .replace(/\x94/g, "ö")

  // we don't want prefixes to screw us up + categorize them:
  //   _groupname__rest.typ  ====>  rest.groupname.typ
  //   [groupname].rest.typ  ====>  rest.groupname.typ
  // must appear before the `_` => `.` change so that the prefix is caught accurately
  let prefix = ""
  let m = null
  m = r.match(/^_([^_]+?)__/)
  if(m != null) {
    prefix = m[1]
    r = r.slice(m[0].length)
  }
  m = r.match(/^\[([^\]]+?)\]/)
  // double-checking the prefix is an additional layer of safety. The case where
  // it could look like two prefixes should never happen, but just in case...
  if(prefix == "" && m != null) {
    prefix = m[1]
    r = r.slice(m[0].length)
  }

  // if the name only separates by `_` instead of `.` we replace all those first
  //   this_is_my_name.txt  ====>  this.is.my.name.txt
  // this is done so the other optimizations still work as expected and we get rid of `_`
  const nonBracketR = r.replace(/\(.+?\)/g, '');
  if(nonBracketR.match(/\.[^.]+\./) == null) {
    r = r.replace(/[_]+/g, '.')
  }

  // we want the bracketed `[..]` prefix to be used as a grouping suffix
  //   [groupname].rest.typ  ====>  rest.groupname.typ
  // these groupnames distract from the actual filename so should be added towards the end
  // must appear after the `_` => `.` change to prevent it from not working
  var subex = r.match(/^\[(.+?)\]/)
  if(subex != null) {
    let old = subex[1];
    let nu = old.replace(/\.[a-z]{3}$/, '');
    r = r.replace(/(.*)\./, "$1."+nu+".").slice(subex[0].length);
  }

  // lots of small and big replacements, especially duplicate characters,
  // problematic characters (utf-8 stuff, quotes), and optimizations (resolution)
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
  r = r.replace(/1080pp/g, '1080p')
  r = r.replace(/\.opus$/g, '.ogg')
  r = r.replace(/([-]?)s(\d\d)[._-]?e(\d\d)([-]?)/, (_, pre, s, e, post) => {
    let a = (pre == null) ? "" : ".-."
    let z = (post == null) ? "" : ".-."
    return a + s + '.' + e + z
  })
  r = r.replace(/s(\d\d?)[.][-][.](\d\d)/, (_, s, e) => pad(s,2) + '.' + e)
  r = r.replace(/season[.]?(\d+)[._-]?episode[.]?(\d+)/, (_, s, e) => pad(s,2) + '.' + pad(e,2))
  r = r.replace(/episode\.(\d+)/, (_, x) => '01.'+pad(x, 2))
  r = r.replace(/(spring|summer|fall|winter).(\d\d\d\d)/, (_, x, y) => y + "." + seasons[x] + "." + x )
  r = r.replace(monthsRegex, (_, x, y) => y + "." + months[x] )
  r = r.replace(/\.(dvdrip|xvid)(-[a-z0-9]+)*/g, '')
  r = r.replace(/dual[.]?audio/, 'ej')

  // a few more post-cleanup duplicates, that may have been created in
  // the process above
  r = r.replace(/\.-\.(\.?-\.)+/g, '.-.')
  r = r.replace(/[.][.]+/g, '.')

  // done very late so we benefit from all cleanups
  if(Config.mini) {
    r = r.replace(/(episode\.\d+\.)(.*)/, (_, x, s) => x + '-.' + minifySuffix(s))
    r = r.replace(/(\.\d\d\.\d\d\.)(.*)/, (_, x, s) => x + '-.' + minifySuffix(s))
  }

  // get back that lovely prefix we started with, but add it to the end
  if(prefix != "") {
    r = r.replace(/(\.[^.]+?)$/, (_, x) => "." + prefix + x)
  }

  const fMode = mode[x]
  if (fMode != null) {
    const parts = fMode.prefix.split(/[^a-zA-Z0-9]+/)
    parts.forEach(part => r = r.replace(part, ''))
    r = fMode.prefix + r.replace(/^[^A-Za-z0-9]+/, '')
  }


  if(bn != r) r = r.replace(/^[.-]+/, '')

  Config.replace.forEach(m => {
    r = r.replace(m.old, m.nu)
  })

  if(bn == r) {
    if(apply) return process.stdout.write(colors.gray('='))
    if(stats != null) stats.unchanged.push(colors.gray(`${r} (unchanged)`))
  } else {
    if(apply) return rename(dir, bn, r)
    if(stats != null) stats.rename.push(`${colors.blue(bn)}  -->  ${colors.cyan(r)}`)
  }

  return r
}

const updateFileModes = (folder, files, mode) => {
  const extensions = {}
  files.forEach(f => extensions[path.extname(f).slice(1)] = true)

  if (!extensions.pdf) {
    return
  }

  delete(extensions.pdf)
  delete(extensions.rar)
  delete(extensions.zip)

  if (Object.keys(extensions).length !== 0) {
    console.log("mixed files in folder, not a pdf collection")
    return
  }

  const folderName = path.basename(path.resolve(folder))
  const prefix = normName(folderName, {}, false, null) + '.-.'

  files.forEach((file) => {
    const ext = path.extname(file)
    if (ext !== '.pdf') return;
    mode[file] = { prefix }
  })
}

const flatten = x => [].concat.apply([], x.filter(i=>i))

const expandFile = (file, mode) => {
  stat = fs.statSync(file);
  if(stat.isFile()) return file;
  if(!stat.isDirectory()) {
    console.log(colors.red(`Cannot process ${file}, it is not a file nor a directory`))
    return null;
  }

  let nuFiles = glob(file + '/*')
  updateFileModes(file, nuFiles, mode)

  nu = expandFiles(nuFiles, mode)
  nu.push(file)
  return nu
}

const expandFiles = (files, mode) => flatten(files.map(x => expandFile(x, mode)))

const printStats = stats => {
  if(stats == null) return;
  stats.unchanged.forEach(x => console.log(x))
  stats.rename.forEach(x => console.log(x))
}

console.log(colors.green(`Input: ${_s(files.length, 'file')}`))

var mode = {}
xfiles = expandFiles(files, mode)
console.log(colors.green(`Expanded files: ${_s(xfiles.length, 'xfiles')}`))

var stats = { rename: [], unchanged: [] }
xfiles.forEach(x => normName(x, mode, false, stats))

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
  xfiles.forEach(x => normName(x, mode, true))
  console.log(colors.green("All done."))
  process.exit(0)
})
