import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs'
import axios, {isAxiosError} from 'axios'
import {removeIgnoreTaskLitsText, createTaskListText} from './utils'

async function validateSubscription(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH
  let repoPrivate: boolean | undefined

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
    repoPrivate = eventData?.repository?.private
  }

  const upstream = 'kentaro-m/task-completed-checker-action'
  const action = process.env.GITHUB_ACTION_REPOSITORY
  const docsUrl =
    'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions'

  core.info('')
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m')
  core.info(`Secure drop-in replacement for ${upstream}`)
  if (repoPrivate === false)
    core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m')
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`)
  core.info('')

  if (repoPrivate === false) return

  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'
  const body: Record<string, string> = {action: action || ''}
  // eslint-disable-next-line @typescript-eslint/camelcase
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      {timeout: 3000}
    )
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error(
        `\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`
      )
      core.error(
        `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`
      )
      process.exit(1)
    }
    core.info('Timeout or API not reachable. Continuing to next step.')
  }
}

async function run(): Promise<void> {
  try {
    await validateSubscription()
    const body = github.context.payload.pull_request?.body

    const token = core.getInput('repo-token', {required: true})
    const githubApi = github.getOctokit(token)
    const appName = 'Task Completed Checker'

    if (!body) {
      core.info('no task list and skip the process.')
      await githubApi.rest.checks.create({
        name: appName,
        // eslint-disable-next-line @typescript-eslint/camelcase
        head_sha: github.context.payload.pull_request?.head.sha,
        status: 'completed',
        conclusion: 'success',
        // eslint-disable-next-line @typescript-eslint/camelcase
        completed_at: new Date().toISOString(),
        output: {
          title: appName,
          summary: 'No task list',
          text: 'No task list'
        },
        owner: github.context.repo.owner,
        repo: github.context.repo.repo
      })
      return
    }

    const result = removeIgnoreTaskLitsText(body)

    core.debug('creates a list of tasks which removed ignored task: ')
    core.debug(result)

    const isTaskCompleted = result.match(/(- \[[ ]\].+)/g) === null

    const text = createTaskListText(result)

    core.debug('creates a list of completed tasks and uncompleted tasks: ')
    core.debug(text)

    await githubApi.rest.checks.create({
      name: appName,
      // eslint-disable-next-line @typescript-eslint/camelcase
      head_sha: github.context.payload.pull_request?.head.sha,
      status: 'completed',
      conclusion: isTaskCompleted ? 'success' : 'failure',
      // eslint-disable-next-line @typescript-eslint/camelcase
      completed_at: new Date().toISOString(),
      output: {
        title: appName,
        summary: isTaskCompleted
          ? 'All tasks are completed!'
          : 'Some tasks are uncompleted!',
        text
      },
      owner: github.context.repo.owner,
      repo: github.context.repo.repo
    })
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}

run()
