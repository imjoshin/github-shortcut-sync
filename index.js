import yargs from "yargs"
import Github from "github-api"
import { ShortcutClient as Shortcut } from "@useshortcut/client"
import ora from "ora"
import dotenv from "dotenv";
import { exit } from "process";

dotenv.config()

const args = yargs()
  .scriptName("yarn start")
  .usage("$0 <command> [arguments]")  
  .option("dry", {
    alias: "d",
    type: "boolean",
    default: true, // TODO make this false
    description: "run a dry run of the tool",
  })
  .help()
  .alias("help", "h")
  .parse()

const requiredEnvVars = [
  "GITHUB_AUTH",
  "GITHUB_REPO_OWNER",
  "GITHUB_REPO",
  "SHORTCUT_AUTH",
  "SHORTCUT_LABEL",
  "SHORTCUT_STORY_PREFIX",
  "SHORTCUT_WORKFLOW_ID_DONE",
  "SHORTCUT_WORKFLOW_ID_NEW",
]

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.log(`\n"${envVar}" is missing, check .env file to make sure it's set.\n`)
    exit(1)
  }
}

const github = new Github({
  token: process.env.GITHUB_AUTH
})

const shortcut = new Shortcut(process.env.SHORTCUT_AUTH)

// TODO make this more async... github-api only supports full results grabbing
// TODO add support for github webhook so we don't have to look at every issue

async function sync() {
  console.log()

  let status = ora({text: 'Fetching issues from Github', color: 'magenta'})
  status.start()

  const issueApi = await github.getIssues(process.env.GITHUB_REPO_OWNER, process.env.GITHUB_REPO)
  const issuesResponse = await issueApi.listIssues()
  const issues = issuesResponse.data.filter(issue => issue.html_url.indexOf('/pull/') < 0)

  status.succeed()

  const metrics = {
    closed: 0,
    created: 0,
    updated: 0,
  }

  status = ora({text: 'Marked closed issues as Done in Shortcut', color: 'yellow'})
  status.start()

  // Find closed Github issues and mark them as done
  const seenIssues = issues.map(issue => issue.id)
  const githubStories = await shortcut.listLabelStories(process.env.SHORTCUT_LABEL)
  const storiesToMarkDone = []
  for (const story of githubStories.data) {
    if (seenIssues.indexOf(story.external_id) < 0) {
      storiesToMarkDone.push(story.id)
    }
  }

  metrics.closed = storiesToMarkDone.length

  if (storiesToMarkDone.length) {
    const storiesUpdate = {
      story_ids: storiesToMarkDone,
      workflow_state_id: process.env.SHORTCUT_WORKFLOW_ID_DONE,
    }

    if (args.dry) {
      console.log(`\n[dry run] Marking stories as done: `, storiesUpdate)
    } else {
      shortcut.updateMultipleStories(storiesUpdate)
    }
  }

  status.succeed()

  let storiesToCreate = []

  status = ora({text: 'Syncing active Github issues to Shortcut stories', color: 'cyan'})
  status.start()

  // Loop through each issue in Github
  for (const issue of issues) {
    // TODO We may be getting rate limited here? We should see if we can fetch all these first
    const matchingStories = await shortcut.getExternalLinkStories({external_link: issue.html_url})
    const stories = matchingStories.data.filter(story => story.external_id === issue.id)

    // if we don't have a story matching this issue, create it
    if (stories.length === 0) {
      const createStory = {
        name: `${process.env.SHORTCUT_STORY_PREFIX} ${issue.title}`,
        description: issue.body,
        external_links: [issue.html_url],
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        external_id: issue.number,
        labels: [{
          id: process.env.SHORTCUT_LABEL,
        }],
        workflow_state_id: process.env.SHORTCUT_WORKFLOW_ID_NEW,
      }

      metrics.created += 1

      if (args.dry) {
        // console.log(`\n[dry run] Creating story: `, { ...createStory, description: `${createStory.description.substring(0, 16)}...`})
      } else {
        storiesToCreate.push(createStory)

        // batch issue creation
        if (storiesToCreate.length % 10 === 0) {
          await shortcut.createMultipleStories(storiesToCreate)
          storiesToCreate = []
        }
      }
    } else {
      // we found a story (or multiple?), update!
      // only update name description, as everything else should be controlled within shortcut
      const updateStory = {
        name: `${process.env.SHORTCUT_STORY_PREFIX} ${issue.title}`,
        description: issue.body,
      }

      for (const story of stories) {
        // first check if we even need to update
        if (updateStory.name === story.name && updateStory.description === story.description) {
          continue
        }

        metrics.updated += 1

        if (args.dry) {
          console.log(`\n[dry run] Updating story: `, { ...updateStory, description: `${updateStory.description.substring(0, 16)}...`})
        } else {
          //  call update
          await shortcut.updateStory(story.id, updateStory)
        }
      }
    }
  }

  // create any stories that are left
  if (storiesToCreate.length) {
    await shortcut.createMultipleStories(storiesToCreate)
  }

  status.succeed()

  console.log(`\n${args.dry ? '[dry run] ' : ''}Created: ${metrics.created}, Updated: ${metrics.updated}, Closed: ${metrics.closed}\n`)

  return
}

sync()
