# github-shortcut-sync

Syncs Github issues to Shortcut stories.

## Install

First, set up the repo!
```
git clone git@github.com:j0sh77/github-shortcut-sync.git
cd github-shortcut-sync
yarn install
```

Then, set up your environmental variables by copying running `cp .env.template .env` and setting values in `.env`.
```
GITHUB_AUTH=""                # auth token from Github
GITHUB_REPO_OWNER=""          # the name of the person/org
GITHUB_REPO=""                # the name of the repo

SHORTCUT_AUTH=""              # auth token from Shortcut
SHORTCUT_LABEL=""             # the label ID to tag all stories with
SHORTCUT_STORY_PREFIX="🔄"    # what story titles should be prefixed with
SHORTCUT_WORKFLOW_ID_DONE=""  # the workflow id to set a story's status to when it's closed
SHORTCUT_WORKFLOW_ID_NEW=""   # the workflow id to set a story's status to when it's opened
```

## Usage

```
yarn start
```

Optionally, you can pass a `--dry` to do a dry run, making sure everything looks ok.