import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(join(dataDir, 'users.sqlite'))
const port = Number(process.env.PORT ?? 3001)
const claimCooldownMs = 3000

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    coins INTEGER NOT NULL DEFAULT 0,
    last_claim_at INTEGER NOT NULL DEFAULT 0
  )
`)

const hashPassword = (password) => (
  createHash('sha256').update(password).digest('hex')
)

const normalizeUsername = (username) => String(username ?? '').trim().toLowerCase()

const publicUser = (row) => ({
  username: row.username,
  coins: row.coins,
  lastClaimAt: row.last_claim_at,
})

const getUser = db.prepare(
  'SELECT username, coins, last_claim_at FROM users WHERE username = ?',
)
const getUserWithPassword = db.prepare(
  'SELECT username, password_hash, coins, last_claim_at FROM users WHERE username = ?',
)
const listUsers = db.prepare(
  'SELECT username, coins, last_claim_at FROM users ORDER BY username COLLATE NOCASE',
)
const createUser = db.prepare(
  'INSERT INTO users (username, password_hash, coins, last_claim_at) VALUES (?, ?, 0, 0)',
)
const setCoins = db.prepare(
  'UPDATE users SET coins = max(0, ?) WHERE username = ?',
)
const adjustCoins = db.prepare(
  'UPDATE users SET coins = max(0, coins + ?) WHERE username = ?',
)
const setClaim = db.prepare(
  'UPDATE users SET coins = coins + 1000, last_claim_at = ? WHERE username = ?',
)

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN ?? '*',
    'Content-Type': 'application/json',
  })
  response.end(JSON.stringify(body))
}

const readJson = async (request) => {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host}`)

  try {
    if (request.method === 'GET' && url.pathname === '/api/users') {
      sendJson(response, 200, { users: listUsers.all().map(publicUser) })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/signup') {
      const body = await readJson(request)
      const username = normalizeUsername(body.username)
      const password = String(body.password ?? '')

      if (!/^[a-z0-9_]{3,18}$/.test(username)) {
        sendJson(response, 400, { error: 'Use 3-18 letters, numbers, or underscores.' })
        return
      }

      if (password.length < 4) {
        sendJson(response, 400, { error: 'Password needs at least 4 characters.' })
        return
      }

      if (getUser.get(username)) {
        sendJson(response, 409, { error: 'That username is already taken.' })
        return
      }

      createUser.run(username, hashPassword(password))
      sendJson(response, 201, { user: publicUser(getUser.get(username)) })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/login') {
      const body = await readJson(request)
      const username = normalizeUsername(body.username)
      const password = String(body.password ?? '')
      const user = getUserWithPassword.get(username)

      if (!user || user.password_hash !== hashPassword(password)) {
        sendJson(response, 401, { error: 'Username or password is wrong.' })
        return
      }

      sendJson(response, 200, { user: publicUser(user) })
      return
    }

    const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)(?:\/([^/]+))?$/)

    if (userMatch) {
      const username = decodeURIComponent(userMatch[1])
      const action = userMatch[2] ?? ''

      if (!getUser.get(username)) {
        sendJson(response, 404, { error: 'User not found.' })
        return
      }

      if (request.method === 'PATCH' && action === 'coins') {
        const body = await readJson(request)
        const coins = Math.max(0, Math.floor(Number(body.coins) || 0))
        setCoins.run(coins, username)
        sendJson(response, 200, { user: publicUser(getUser.get(username)) })
        return
      }

      if (request.method === 'POST' && action === 'adjust-coins') {
        const body = await readJson(request)
        const delta = Math.floor(Number(body.delta) || 0)
        adjustCoins.run(delta, username)
        sendJson(response, 200, { user: publicUser(getUser.get(username)) })
        return
      }

      if (request.method === 'POST' && action === 'claim') {
        const user = getUser.get(username)
        const now = Date.now()

        if (now - user.last_claim_at < claimCooldownMs) {
          sendJson(response, 429, {
            error: 'Claim cooldown active.',
            user: publicUser(user),
          })
          return
        }

        setClaim.run(now, username)
        sendJson(response, 200, { user: publicUser(getUser.get(username)) })
        return
      }
    }

    sendJson(response, 404, { error: 'Not found' })
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: 'Invalid JSON.' })
      return
    }

    console.error(error)
    sendJson(response, 500, { error: 'Internal server error.' })
  }
}).listen(port, () => {
  console.log(`User API listening on http://localhost:${port}`)
})
