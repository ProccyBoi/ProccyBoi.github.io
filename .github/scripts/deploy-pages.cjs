'use strict'

const POLL_INTERVAL_MS = 10_000
const DEPLOYMENT_TIMEOUT_MS = 45 * 60_000
const CREATE_RETRY_COUNT = 6
const CREATE_RETRY_DELAY_MS = 30_000

const finalErrors = new Map([
  ['deployment_failed', 'GitHub Pages reported a deployment failure.'],
  ['deployment_content_failed', 'GitHub Pages rejected the uploaded site artifact.'],
  ['deployment_cancelled', 'The GitHub Pages deployment was cancelled.'],
  ['deployment_lost', 'GitHub Pages lost the deployment before reporting a result.']
])

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

function errorMessage(error) {
  return error?.response?.data?.message || error?.message || String(error)
}

function staleDeploymentId(message) {
  const match = message.match(/Please cancel ([0-9a-f]{40})/i)
  return match?.[1]
}

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo

  const artifactResponse = await github.request(
    'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts',
    {
      owner,
      repo,
      run_id: context.runId,
      per_page: 100
    }
  )

  const artifacts = artifactResponse.data.artifacts.filter(
    artifact => artifact.name === 'github-pages' && !artifact.expired
  )

  if (artifacts.length !== 1) {
    throw new Error(
      `Expected one non-expired github-pages artifact, found ${artifacts.length}.`
    )
  }

  const artifact = artifacts[0]
  const idToken = await core.getIDToken()
  let deployment

  for (let attempt = 1; attempt <= CREATE_RETRY_COUNT; attempt += 1) {
    try {
      deployment = await github.request(
        'POST /repos/{owner}/{repo}/pages/deployments',
        {
          owner,
          repo,
          artifact_id: artifact.id,
          pages_build_version: context.sha,
          oidc_token: idToken
        }
      )
      break
    } catch (error) {
      const message = errorMessage(error)
      const staleId = staleDeploymentId(message)

      if (!staleId || attempt === CREATE_RETRY_COUNT) {
        throw error
      }

      core.warning(
        `GitHub reports stale Pages deployment ${staleId}; requesting cancellation before retry ${attempt + 1}/${CREATE_RETRY_COUNT}.`
      )

      await github.request(
        'POST /repos/{owner}/{repo}/pages/deployments/{deployment_id}/cancel',
        {
          owner,
          repo,
          deployment_id: staleId
        }
      )

      await sleep(CREATE_RETRY_DELAY_MS)
    }
  }

  const data = deployment.data
  const deploymentId =
    data.id || data.status_url?.split('/').pop() || context.sha

  core.info(`Created Pages deployment ${deploymentId} from artifact ${artifact.id}.`)
  core.setOutput('page_url', data.page_url || '')

  const deadline = Date.now() + DEPLOYMENT_TIMEOUT_MS
  let lastStatus = ''
  let statusChecks = 0
  let requestErrors = 0

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)

    try {
      const statusResponse = await github.request(
        'GET /repos/{owner}/{repo}/pages/deployments/{deployment_id}',
        {
          owner,
          repo,
          deployment_id: deploymentId
        }
      )

      const status = statusResponse.data.status
      statusChecks += 1
      requestErrors = 0

      if (status !== lastStatus || statusChecks % 6 === 0) {
        core.info(`Pages deployment status: ${status}`)
        lastStatus = status
      }

      if (status === 'succeed') {
        core.info('GitHub Pages deployment succeeded.')
        core.setOutput('page_url', statusResponse.data.page_url || data.page_url || '')
        return
      }

      if (finalErrors.has(status)) {
        throw new Error(finalErrors.get(status))
      }
    } catch (error) {
      requestErrors += 1

      if (finalErrors.has(lastStatus) || requestErrors >= 20) {
        throw error
      }

      core.warning(`Pages status check failed (${requestErrors}/20): ${errorMessage(error)}`)
    }
  }

  throw new Error(
    'GitHub Pages did not report a final result within 45 minutes. The deployment was left active so GitHub can finish it later.'
  )
}
