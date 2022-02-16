const yargs = require("yargs")
const GitHub = require("github-api")
const Shortcut = require("@useshortcut/client").ShortcutClient
require('dotenv').config()

yargs
  .scriptName("yarn start")
  .usage("$0 <command> [arguments]")  
  .option("dry", {
    alias: "d",
    type: "boolean",
    default: false,
    description: "run a dry run of the tool",
  })
  .help()
  .alias("help", "h")
  .parse()

const github = new GitHub({
  token: process.env.GITHUB_AUTH
})

const shortcut = new Shortcut(process.env.SHORTCUT_AUTH)

// TODO extract config

async function sync() {
  console.log(`Syncing issues from GitHub to Shortcut...`)
  const issueApi = await github.getIssues(process.env.GITHUB_REPO_OWNER, process.env.GITHUB_REPO)
  const issues = await issueApi.listIssues({status: 'all'})
  console.log(`Total GitHub issues: ${issues.data.length}`)

  const userInfo = await shortcut.getCurrentMemberInfo()
  console.log(`Logged into shortcut as ${userInfo.data.name}`)
}

sync()
