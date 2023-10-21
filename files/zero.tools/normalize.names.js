#!/usr/bin/env node
const colors = require('colors/safe');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const glob = require('glob').sync;

const Config = {
  mini: false,
  replace: [],
  exceptions: {"_ocr": true},
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

const normName = (x, hooks, apply, stats) => {
  var dir = path.dirname(x.path)
  var bn = path.basename(x.path)
  var r = bn

  // exceptions
  if(Config.exceptions[r]) return;

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

  // lots of small and big replacements, especially duplicate characters,
  // problematic characters (utf-8 stuff, quotes), and optimizations (resolution)
  const cleanChars = (r) => {
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
    return r
  }

  if(Config.mini) {
    // remove code indicators like [abcd1234]
    r = r.replace(/\[[a-z0-9]{8}\]/g, '')
  }

  r = cleanChars(r)

  r = r.replace(/1280x720/g, '720p')
  r = r.replace(/1920x1080/g, '1080p')
  r = r.replace(/1080pp/g, '1080p')
  r = r.replace(/\.opus$/g, '.ogg')
  r = r.replace(/-(\d\d)-/, (_, e) => '.' + e + '.')
  r = r.replace(/([-]?)s(\d\d)[._-]?e(\d\d)([-]?)/, (_, pre, s, e, post) => {
    let a = (pre == null) ? "" : ".-."
    let z = (post == null) ? "" : ".-."
    return a + s + '.' + e + z
  })
  r = r.replace(/s(\d\d?)[.][-][.](\d\d)/, (_, s, e) => pad(s,2) + '.' + e)
  r = r.replace(/season[.]?(\d+)[._-]?episode[.]?(\d+)/, (_, s, e) => pad(s,2) + '.' + pad(e,2))
  r = r.replace(/episode\.(\d+)/, (_, x) => '01.'+pad(x, 2))
  r = r.replace(/(\D)(\d)x(\d{1,2})(\D)/, (_, p1, s, e, p2) => p1 + pad(s,2) + '.' + pad(e,2) + p2)
  r = r.replace(/(spring|summer|fall|winter).(\d\d\d\d)/, (_, x, y) => y + "." + seasons[x] + "." + x )
  r = r.replace(monthsRegex, (_, x, y) => y + "." + months[x] )
  r = r.replace(/\.(dvdrip|xvid)(-[a-z0-9]+)*/g, '')
  r = r.replace(/dual[.]?audio/, 'ej')

  // a few more post-cleanup duplicates, that may have been created in
  // the process above
  r = r.replace(/\.-\.(\.?-\.)+/g, '.-.')
  r = r.replace(/[.][.]+/g, '.')

  // // TODO: this is really removing way too much right now, we need a better algo
  // // done very late so we benefit from all cleanups
  // if(Config.mini) {
  //   r = r.replace(/(episode\.\d+\.)(.*)/, (_, x, s) => x + '-.' + minifySuffix(s))
  //   r = r.replace(/(\.\d\d\.\d\d\.)(.*)/, (_, x, s) => x + '-.' + minifySuffix(s))
  // }

  // get back that lovely prefix we started with, but add it to the end
  if(prefix != "") {
    prefix = cleanChars(prefix)
    r = r.replace(/(\.[^.]+?)$/, (_, x) => "." + prefix + x)
  }

  if(bn != r) r = r.replace(/^[.-]+/, '')

  const hook = hooks[x.path]
  if (hook != null) {
    r = hook(r)
  }

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

const normalizeFolderFiles = (folder, all, hooks) => {
  let files = all.filter(x => x.stat.isFile())

  const extensions = {}
  files.forEach(f => extensions[path.extname(f.path).slice(1)] = true)

  if(Object.keys(extensions).length === 0) {
    return
  }

  const folderName = path.basename(path.resolve(folder))

  if (extensions.jpg || extensions.jpeg || extensions.png) {
    delete(extensions.jpeg)
    delete(extensions.jpg)
    delete(extensions.png)

    if (Object.keys(extensions).length !== 0) {
      console.log("mixed files in folder, not a jpg collection")
      return
    }

    const maxDigits = 3
    let outliers = []
    files.map(x => path.basename(x.path)).forEach(x => {
      if(normalizeSequence(x, folderName, maxDigits) == null) {
        outliers.push(x)
      }
    })

    if(outliers.length !== 0) {
      debugger
      return
    }

    files.forEach(f => {
      hooks[f.path] = (name) => {
        if(f.stat.isFile() && (f.stat.mode & 0o777) != (f.stat.mode & 0o644)) {
          fs.chmodSync(f.path, 0o644)
        }
        let nu = normalizeSequence(name, folderName, maxDigits)
        if(nu == null) return name
        return nu
      }
    })
  }
}

const normalizeSequence = (name, prefix, numLen) => {
  let base = name
  if(name.startsWith(prefix)) {
    base = name.slice(prefix.length+1)
  }

  // special handling for base:
  // - cover.anything.jpg ==> prefix.000.cover.anything.jpg
  if(base.match(/cover/)) return prefix + "." + ("0").padStart(numLen,"0") + "." + base.replace(/.*cover/, "cover");
  // - 000.12.jpg ==> prefix.000.12.jpg
  if(base.match(/000\.\d+/)) return prefix + "." + base;
  // - 000a.jpg ==> prefix.000.a.jpg
  if(base.match(/000\.?[a-z]/)) return prefix + "." + base.replace(/(0+)\.?(a-z)/, "\\1.\\2");

  let m = base.match(/\d+/g)
  if(m == null) { return null }

  let last = m[m.length-1]
  let num = parseInt(last, 10)
  if(isNaN(num)) { return null }

  let nums = (num+"").padStart(numLen,"0")

  let suffix = base.match(/\.[^.]+$/)
  if(suffix == null) { return null }

  let res = prefix + "." + nums + suffix[0]
  return res
}

const flatten = x => [].concat.apply([], x.filter(i=>i))

const expandFile = (path, hooks) => {
  stat = fs.statSync(path);
  let file = {
    path: path,
    stat,
  }
  let res = [file]

  if(stat.isFile()) return res;

  if(!stat.isDirectory()) {
    console.log(colors.red(`Cannot process ${path}, it is not a file nor a directory`))
    return null;
  }

  let nu = expandDir(path, hooks)
  res.push(...nu)

  return res
}

const expandDir = (path, hooks) => {
  let all = glob(path + '/*').
    map(path => ({
      path: path,
      stat: fs.statSync(path),
    }))

  normalizeFolderFiles(path, all, hooks)

  all.filter(x => x.stat.isDirectory()).forEach(x => {
    let nu = expandDir(x.path, hooks)
    all.push(...nu)
  })
  return all
}

const expandFiles = (files, hooks) => flatten(files.map(x => expandFile(x, hooks)))

const printStats = stats => {
  if(stats == null) return;
  stats.unchanged.forEach(x => console.log(x))
  stats.rename.forEach(x => console.log(x))
}

console.log(colors.green(`Input: ${_s(files.length, 'file')}`))

var hooks = {}
xfiles = expandFiles(files, hooks)
console.log(colors.green(`Expanded files: ${_s(xfiles.length, 'xfiles')}`))

var stats = { rename: [], unchanged: [] }
xfiles.forEach(x => normName(x, hooks, false, stats))

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
  xfiles.forEach(x => normName(x, hooks, true))
  console.log(colors.green("All done."))
  process.exit(0)
})
