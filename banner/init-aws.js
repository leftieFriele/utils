let exists = require('fs').existsSync
let homeDir = require('os').homedir()
let {join} = require('path')
let updater = require('../updater')

/**
 * Initialize AWS configuration, in order of preference:
 * - @aws pragma + ~/.aws/credentials file
 * - Environment variables
 * - Dummy creds (if absolutely necessary)
 */
module.exports = function initAWS ({arc, needsValidCreds=true}) {
  // AWS SDK intentionally not added to package deps; assume caller already has it
  // eslint-disable-next-line
  let aws = require('aws-sdk')

  try {
    let hasCredsFile = exists(join(homeDir, '.aws', 'credentials'))
    arc.aws = arc.aws || []
    let region = arc.aws.find(e=> e[0] === 'region')
    if (region && region[1]) {
      process.env.AWS_REGION = region[1]
    }
    /**
     * Always ensure we end with cred a final credential check
     */
    // Allow local cred file to be overriden by env vars
    let envOverride = process.env.ARC_AWS_CREDS === 'env'
    if (hasCredsFile && !envOverride) {
      let profile = arc.aws.find(e=> e[0] === 'profile')
      process.env.ARC_AWS_CREDS = 'profile'
      if (profile && profile[1]) {
        process.env.AWS_PROFILE = profile
      }
      credentialCheck()
    }

    /**
     * Final credential check to ensure we meet the cred needs of Arc various packages
     * - Packages that **need** valid creds should be made aware that none are available (ARC_AWS_CREDS = 'missing')
     * - Others that **do not need** valid creds should work fine when supplied with dummy creds (or none at all, but we'll backfill dummy creds jic)
     */
    function credentialCheck() {
      let creds = aws.config.credentials
      let noCreds = !creds || creds && !creds.accessKeyId
      if (noCreds && needsValidCreds) {
        // Set missing creds flag and let consuming modules handle as necessary
        process.env.ARC_AWS_CREDS = 'missing'
      }
      else if (noCreds && !needsValidCreds) {
        // Any creds will do (e.g. Sandbox DynamoDB)
        process.env.ARC_AWS_CREDS = 'dummy'
        aws.config.credentials = new aws.Credentials({
          accessKeyId: 'xxx',
          secretAccessKey: 'xxx'
        })
      }
      // If no creds, always unset profile to prevent misleading claims about profile state
      if (noCreds) {
        delete process.env.AWS_PROFILE
      }
    }
  }
  catch(e) {
    // Don't exit process here; caller should be responsible
    let update = updater('Startup')
    update.err(e)
  }
}
