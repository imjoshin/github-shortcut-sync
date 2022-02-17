const yargs = require("yargs")
const GitHub = require("github-api")
const Shortcut = require("@useshortcut/client").ShortcutClient
require('dotenv').config()

const args = yargs
  .scriptName("yarn start")
  .usage("$0 <command> [arguments]")  
  .option("dry", {
    alias: "d",
    type: "boolean",
    default: true,
    description: "run a dry run of the tool",
  })
  .help()
  .alias("help", "h")
  .parse()

const github = new GitHub({
  token: process.env.GITHUB_AUTH
})

const shortcut = new Shortcut(process.env.SHORTCUT_AUTH)

// TODO make this more async... github-api only supports full results grabbing
// TODO add support for github webhook

// TODO make better output

async function sync() {
  console.log(`Syncing issues from GitHub to Shortcut...`)

  const issueApi = await github.getIssues(process.env.GITHUB_REPO_OWNER, process.env.GITHUB_REPO)
  const issuesResponse = await issueApi.listIssues()
  const issues = issuesResponse.data.filter(issue => issue.html_url.indexOf('/pull/') < 0)

  console.log(`Total GitHub issues: ${issues.length}`)

  // Find closed Github issues and mark them as done
  const seenIssues = issues.map(issue => issue.id)
  const githubStories = await shortcut.listLabelStories(process.env.SHORTCUT_LABEL)
  const storiesToMarkDone = []
  for (const story of githubStories.data) {
    if (seenIssues.indexOf(story.external_id) < 0) {
      storiesToMarkDone.push(story.id)
    }
  }

  if (storiesToMarkDone.length) {
    const storiesUpdate = {
      story_ids: storiesToMarkDone,
      workflow_state_id: process.env.SHORTCUT_WORKFLOW_ID_DONE,
    }

    if (args.dry) {
      console.log(`[dry run] Marking stories as done: `, storiesUpdate)
    } else {
      shortcut.updateMultipleStories(storiesUpdate)
    }
  }

  let storiesToCreate = []

  // Loop through each issue in Github
  for (const issue of issues) {
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

      if (args.dry) {
        console.log(`[dry run] Creating story: `, { ...createStory, description: `${createStory.description.substring(0, 16)}...`})
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

        if (args.dry) {
          console.log(`[dry run] Updating story: `, { ...updateStory, description: `${updateStory.description.substring(0, 16)}...`})
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

  return
}

sync()
