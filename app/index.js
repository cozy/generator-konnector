const promisify = require('util').promisify
const glob = promisify(require('glob'))
const Generator = require('yeoman-generator');
const updateNotifier = require('update-notifier')

const pkg = require('../package.json');

const requiredInfos = [
  { name: 'AUTHOR', message: 'Name of the author ?', default: 'Patrick Browne' },
  { name: 'CATEGORY', message: 'Category of the konnector (other, transport, services)', default: 'transport' },
  { name: 'LINK', message: 'Link to the main page of the vendor', default: 'http://cozy.io' },
  { name: 'SHORT_DESCRIPTION_EN', message: 'A short description in English', default: 'Long description' },
  { name: 'LONG_DESCRIPTION_EN', message: 'A longer description in English', default: 'Short description' },
  { name: 'SHORT_DESCRIPTION_FR', message: 'A short description in French', default: 'Longue description' },
  { name: 'LONG_DESCRIPTION_FR', message: 'A longer description in French', default: 'Description courte' },
  { name: 'NAME', message: 'Name of your Connector', default: 'My super connector' },
  { name: 'SLUG', message: 'Desired slug for your connector', default: 'my-konnector' },
  { name: 'SOURCE', message: 'Git repository of your connector', default: 'https://github.com/konnectors/my-konnector.git' }
]

const flatten =
  a => Array.isArray(a) ? [].concat(...a.map(flatten)) : a

const dot2dash = x => x.replace(/\./g, '-')
const dash2dot = x => x.replace(/-/g, '.')

const fromPairs = pairs => {
  const res = {}
  pairs.forEach(([k, v]) => res[k] = v)
  return res
}

const getDescriptions = (answers, locale) => (
  fromPairs(
    Object
      .entries(answers)
      .filter(x => x[0].indexOf(`${locale}-`) === 0)
      .map(([name, value]) => [
        name.replace(`${locale}-`, ''),
        { description: value }
      ])
  )
)

const doctypeInfos = {
  'io.cozy.bills': {
    name: 'bills',
    descriptions: {
      en: 'Used to save bills',
      fr: 'Utilisé pour sauver les factures'
    }
  },
  'io.cozy.files': {
    name: 'files',
    descriptions: {
      en: 'Used to save files',
      fr: 'Utilisé pour sauver les fichiers'
    }
  },
  'io.cozy.bank.operations': {
    name: 'banking operations',
    descriptions: {
      en: 'Used to save banking operations',
      fr: 'Utilisé pour sauver les opérations bancaires'
    }
  }
}

const getDefaultName = doctype => {
  const infos = doctypeInfos[doctype]
  if (infos) {
    return infos.name
  }
}

const getDefaultDescriptionForDoctype = (doctype, locale) => {
  const infos = doctypeInfos[doctype]
  if (infos) {
    return infos.descriptions[locale]
  }
}

const prettifyJson = (fs, dest) => {
  const data = fs.readJSON(dest)
  fs.writeJSON(dest, data, null, 2)
}

module.exports = class extends Generator {
  async prompting() {
    updateNotifier({pkg}).notify()

    const prompts = requiredInfos.map(x => ({
      type: 'input',
      ...x
    }))

    const answers = await this.prompt(prompts)
    this.data = answers
    this.data.toJSON = x => JSON.stringify(x, null, 2)

    const permissionsAnswers = await this.prompt([
      {
        name: 'permissions',
        message: 'Permissions required by your application (separated by commas)',
        choices: [
          {
            name: 'io.cozy.files',
            message: 'io.cozy.files',
            checked: true
          },
          {
            name: 'io.cozy.bills',
            message: 'io.cozy.bills',
            checked: true
          },
          {
            name: 'io.cozy.bank.operations',
            message: 'io.cozy.bank.operations',
            checked: false
          },
          {
            name: 'others',
            message: 'others',
            checked: false
          },
        ],
        type: 'checkbox'
      }
    ])

    const permissions = permissionsAnswers.permissions
    if (permissions.indexOf('others') > -1) {
      const otherPermissions = await this.prompt([{
        message: 'Type other permissions separated by comma',
        name: 'permissions'
      }])
      permissions.push.apply(permissions, otherPermissions.permissions.split(','))
      const otherIndex = permissions.indexOf('others')
      permissions.splice(otherIndex, 1)
    }

    const permissionNames = await this.prompt(permissions.map(x => ({
      name: dot2dash(x),
      message: `Name for ${x}`,
      default: getDefaultName(x)
    })))
    const descriptionsQ = flatten(Object.entries(permissionNames).map(([dashedDoctype, name]) => [{
      name: `en-${name}`,
      message: `English description for ${name}`,
      type: 'input',
      default: getDefaultDescriptionForDoctype(dash2dot(dashedDoctype), 'en')
    }, {
      name: `fr-${name}`,
      message: `French description for ${name}`,
      type: 'input',
      default: getDefaultDescriptionForDoctype(dash2dot(dashedDoctype), 'fr')
    }]))
    const descriptions = await this.prompt(descriptionsQ)
    this.data.PERMISSION_DESCRIPTIONS_EN = getDescriptions(descriptions, 'en')
    this.data.PERMISSION_DESCRIPTIONS_FR = getDescriptions(descriptions, 'fr')
    this.data.PERMISSIONS = fromPairs(Object.entries(permissionNames).map(([dashedDoctype, name]) => [
      name,
      { type: dash2dot(dashedDoctype) }
    ]))
    this.data.GITHUB_SLUG = this.data.SOURCE.replace(/https:\/\/(www\.)?github.com\//, '').replace(/\.git$/, '')
    console.log(this.data.GITHUB_SLUG)
  }
  
  async writing() {
    const root = this.sourceRoot()
    const g = this.templatePath('**/*')
    const files = await glob(g, { dot: true })
    files.forEach(filename => {
      const dest = `./${filename.replace(root, '')}`
      this.fs.copyTpl(filename, dest, this.data)
      if (filename.match(/package.json/) || filename.match(/manifest.konnector/)) {
        prettifyJson(this.fs, dest)
      }
    })
  }
};

