import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'data')
const envPath = join(__dirname, '..', '.env')
mkdirSync(dataDir, { recursive: true })

if (existsSync(envPath)) {
  const envText = readFileSync(envPath, 'utf8')

  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)

    if (!match || process.env[match[1]] !== undefined) {
      continue
    }

    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
}

const db = new DatabaseSync(join(dataDir, 'users.sqlite'))
const port = Number(process.env.PORT ?? 3001)
const adminUsername = 'niklas'
const uncCoinApiBaseUrl = String(process.env.UNC_WEB_API_BASE_URL ?? process.env.UNC_WEB_API_URL ?? '').replace(/\/$/, '')
const uncCoinApiToken = String(process.env.UNC_WEB_API_TOKEN ?? '')
const uncCoinHouseAddress = String(process.env.UNC_BETTING_SHARK_ADDRESS ?? '')
const uncDepositPollMs = Math.max(5000, Number(process.env.UNC_DEPOSIT_POLL_MS ?? 60000))
const sessions = new Map()
const activeFlaxTickets = new Map()
const slotSymbols = ['BD', 'FYI', '1000', '!!!', '777']
const defaultGameSettings = {
  slotsCost: 160,
  slotsTriplePayout: 1200,
  slotsPairPayout: 250,
  flipCost: 110,
  flipPayout: 220,
  highLowCost: 160,
  highLowPayout: 360,
  diceCost: 250,
  diceSixPayout: 900,
  diceHighPayout: 320,
  luckyCost: 210,
  luckyPayout: 650,
  flaxCost: 2840,
  flaxPrizeSmall: 1000,
  flaxPrizeMedium: 2500,
  flaxPrizeLarge: 5000,
  flaxPrizeHuge: 10000,
  flaxPrizeJackpot: 100000,
}
const previousGameSettings = {
  slotsCost: 100,
  flipCost: 100,
  highLowCost: 150,
  diceCost: 200,
  luckyCost: 250,
  flaxCost: 1000,
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    coins INTEGER NOT NULL DEFAULT 0,
    last_claim_at INTEGER NOT NULL DEFAULT 0,
    wallet_address TEXT UNIQUE,
    wallet_created_at INTEGER NOT NULL DEFAULT 0,
    last_wallet_check_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS game_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wallet_deposits (
    transaction_key TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    from_address TEXT NOT NULL,
    amount INTEGER NOT NULL,
    block_id INTEGER NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL DEFAULT '',
    processed_at INTEGER NOT NULL,
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
  )
`)

const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name))
if (!userColumns.has('wallet_address')) {
  db.exec('ALTER TABLE users ADD COLUMN wallet_address TEXT')
}
if (!userColumns.has('wallet_created_at')) {
  db.exec('ALTER TABLE users ADD COLUMN wallet_created_at INTEGER NOT NULL DEFAULT 0')
}
if (!userColumns.has('last_wallet_check_at')) {
  db.exec('ALTER TABLE users ADD COLUMN last_wallet_check_at INTEGER NOT NULL DEFAULT 0')
}

const hashPassword = (password) => (
  createHash('sha256').update(password).digest('hex')
)

const normalizeUsername = (username) => String(username ?? '').trim().toLowerCase()
const normalizeSettingValue = (value) => Math.max(0, Math.floor(Number(value) || 0))

const createSession = (username) => {
  const token = randomBytes(32).toString('hex')
  sessions.set(token, username)
  return token
}

const getSessionUsername = (request) => {
  const authorization = String(request.headers.authorization ?? '')
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''

  return sessions.get(token) ?? ''
}

const publicUser = (row) => ({
  username: row.username,
  coins: row.coins,
  lastClaimAt: row.last_claim_at,
  walletAddress: row.wallet_address ?? '',
  walletCreatedAt: row.wallet_created_at,
  lastWalletCheckAt: row.last_wallet_check_at,
})

const getUser = db.prepare(
  'SELECT username, coins, last_claim_at, wallet_address, wallet_created_at, last_wallet_check_at FROM users WHERE username = ?',
)
const getUserWithPassword = db.prepare(
  'SELECT username, password_hash, coins, last_claim_at, wallet_address, wallet_created_at, last_wallet_check_at FROM users WHERE username = ?',
)
const listUsers = db.prepare(
  'SELECT username, coins, last_claim_at, wallet_address, wallet_created_at, last_wallet_check_at FROM users ORDER BY username COLLATE NOCASE',
)
const createUser = db.prepare(
  'INSERT INTO users (username, password_hash, coins, last_claim_at, wallet_address, wallet_created_at) VALUES (?, ?, 0, 0, ?, ?)',
)
const deleteUser = db.prepare('DELETE FROM users WHERE username = ?')
const setPassword = db.prepare(
  'UPDATE users SET password_hash = ? WHERE username = ?',
)
const setCoins = db.prepare(
  'UPDATE users SET coins = max(0, ?) WHERE username = ?',
)
const adjustCoins = db.prepare(
  'UPDATE users SET coins = max(0, coins + ?) WHERE username = ?',
)
const debitCoins = db.prepare(
  'UPDATE users SET coins = coins - ? WHERE username = ? AND coins >= ?',
)
const setUserWallet = db.prepare(
  'UPDATE users SET wallet_address = ?, wallet_created_at = ? WHERE username = ?',
)
const touchUserWalletCheck = db.prepare(
  'UPDATE users SET last_wallet_check_at = ? WHERE username = ?',
)
const listGameSettings = db.prepare(
  'SELECT setting_key, setting_value FROM game_settings',
)
const createGameSetting = db.prepare(
  'INSERT OR IGNORE INTO game_settings (setting_key, setting_value) VALUES (?, ?)',
)
const setGameSetting = db.prepare(
  'INSERT INTO game_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value',
)
const getGameSetting = db.prepare(
  'SELECT setting_value FROM game_settings WHERE setting_key = ?',
)
const listWalletUsers = db.prepare(
  "SELECT username, wallet_address FROM users WHERE wallet_address IS NOT NULL AND wallet_address != ''",
)
const createWalletDeposit = db.prepare(
  'INSERT OR IGNORE INTO wallet_deposits (transaction_key, username, wallet_address, from_address, amount, block_id, timestamp, processed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
)

for (const [setting, value] of Object.entries(defaultGameSettings)) {
  createGameSetting.run(setting, value)
}

for (const [setting, oldValue] of Object.entries(previousGameSettings)) {
  const storedSetting = getGameSetting.get(setting)

  if (storedSetting?.setting_value === oldValue) {
    setGameSetting.run(setting, defaultGameSettings[setting])
  }
}

const getGameSettings = () => ({
  ...defaultGameSettings,
  ...Object.fromEntries(
    listGameSettings.all().map((row) => [row.setting_key, normalizeSettingValue(row.setting_value)]),
  ),
})

const hasUncCoinConfig = () => Boolean(uncCoinApiBaseUrl && uncCoinApiToken)

const uncCoinRequest = async (path, options = {}) => {
  if (!hasUncCoinConfig()) {
    throw new Error('UncCoin API is not configured.')
  }

  const response = await fetch(`${uncCoinApiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${uncCoinApiToken}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    const detail = body.detail?.message ?? body.detail ?? body.error ?? response.statusText
    throw new Error(typeof detail === 'string' ? detail : 'UncCoin API request failed.')
  }

  return body
}

const createUncCoinWallet = async (username) => {
  if (!hasUncCoinConfig()) {
    return ''
  }

  const body = await uncCoinRequest('/api/wallets', {
    method: 'POST',
    body: JSON.stringify({
      wallet_name: `bigdick-fyi-${username}`,
      external_user_id: username,
    }),
  })
  const walletAddress = String(body.wallet?.wallet_address ?? '')

  if (!walletAddress) {
    throw new Error('UncCoin API did not return a wallet address.')
  }

  return walletAddress
}

const ensureUserWallet = async (username) => {
  const user = getUser.get(username)

  if (!user || user.wallet_address || !hasUncCoinConfig()) {
    return user?.wallet_address ?? ''
  }

  const walletAddress = await createUncCoinWallet(username)
  setUserWallet.run(walletAddress, Date.now(), username)
  return walletAddress
}

const normalizeIncomingAmount = (value) => {
  const amount = Math.floor(Number(value) || 0)
  return amount > 0 ? amount : 0
}

const syncWalletDepositsForUser = async (user) => {
  const walletAddress = String(user.wallet_address ?? '')

  if (!walletAddress || !hasUncCoinConfig()) {
    return { credited: 0, deposits: 0 }
  }

  const body = await uncCoinRequest(`/api/wallets/${encodeURIComponent(walletAddress)}/incoming`)
  const incoming = Array.isArray(body.incoming) ? body.incoming : []
  let credited = 0
  let deposits = 0

  db.exec('BEGIN')
  try {
    for (const transaction of incoming) {
      const transactionKey = String(transaction.transaction_key ?? '')
      const amount = normalizeIncomingAmount(transaction.amount)

      if (!transactionKey || amount <= 0) {
        continue
      }

      const result = createWalletDeposit.run(
        transactionKey,
        user.username,
        walletAddress,
        String(transaction.from_address ?? ''),
        amount,
        Math.floor(Number(transaction.block_id) || 0),
        String(transaction.timestamp ?? ''),
        Date.now(),
      )

      if (result.changes > 0) {
        adjustCoins.run(amount, user.username)
        credited += amount
        deposits += 1
      }
    }

    touchUserWalletCheck.run(Date.now(), user.username)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return { credited, deposits }
}

const syncAllWalletDeposits = async () => {
  if (!hasUncCoinConfig()) {
    return
  }

  for (const user of listWalletUsers.all()) {
    try {
      await syncWalletDepositsForUser(user)
    } catch (error) {
      console.error(`Wallet deposit sync failed for ${user.username}:`, error)
    }
  }
}

const pickRandomCoinFace = () => (Math.random() > 0.5 ? 'BD' : 'FYI')
const pickRandomLuckyNumber = () => Math.ceil(Math.random() * 3)
const pickRandomHighLowGuess = () => (Math.random() > 0.5 ? 'higher' : 'lower')

const shuffle = (items) => {
  const shuffledItems = [...items]

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const item = shuffledItems[index]
    shuffledItems[index] = shuffledItems[randomIndex]
    shuffledItems[randomIndex] = item
  }

  return shuffledItems
}

const getFlaxPrizes = (settings) => [
  { amount: settings.flaxPrizeSmall, weight: 40 },
  { amount: settings.flaxPrizeMedium, weight: 25 },
  { amount: settings.flaxPrizeLarge, weight: 18 },
  { amount: settings.flaxPrizeHuge, weight: 12 },
  { amount: settings.flaxPrizeJackpot, weight: 5 },
]

const pickWeightedFlaxPrize = (availablePrizes) => {
  const totalWeight = availablePrizes.reduce((total, prize) => total + prize.weight, 0)
  let pick = Math.random() * totalWeight

  for (const prize of availablePrizes) {
    pick -= prize.weight

    if (pick <= 0) {
      return prize.amount
    }
  }

  return availablePrizes[availablePrizes.length - 1].amount
}

const createFlaxTicket = (settings) => {
  const flaxPrizes = getFlaxPrizes(settings)
  const isWinningTicket = Math.random() < 0.35
  const winningPrize = pickWeightedFlaxPrize(flaxPrizes)
  const prizes = isWinningTicket ? [winningPrize, winningPrize, winningPrize] : []
  const prizeCounts = prizes.reduce((counts, prize) => ({
    ...counts,
    [prize]: (counts[prize] ?? 0) + 1,
  }), {})

  while (prizes.length < 9) {
    const availablePrizes = flaxPrizes.filter((prize) => {
      const maxCopies = prize.amount === winningPrize && isWinningTicket ? 3 : 2
      return (prizeCounts[prize.amount] ?? 0) < maxCopies
    })
    const prize = pickWeightedFlaxPrize(availablePrizes.length > 0 ? availablePrizes : flaxPrizes)
    prizes.push(prize)
    prizeCounts[prize] = (prizeCounts[prize] ?? 0) + 1
  }

  return shuffle(prizes).map((prize, id) => ({
    id,
    prize,
    scratched: false,
  }))
}

const getFlaxPayout = (ticket) => {
  const prizeCounts = ticket.reduce((counts, square) => ({
    ...counts,
    ...(square.scratched ? { [square.prize]: (counts[square.prize] ?? 0) + 1 } : {}),
  }), {})
  const winningPrize = Object.entries(prizeCounts)
    .find(([, count]) => count >= 3)?.[0]

  return winningPrize ? Number(winningPrize) : 0
}

const publicFlaxTicket = (ticket) => ticket.map((square) => ({
  id: square.id,
  prize: square.scratched ? square.prize : 0,
  scratched: square.scratched,
}))

const runCoinGame = (username, cost, play) => {
  const user = getUser.get(username)

  if (user.coins < cost) {
    return { error: `This game costs ${cost.toLocaleString()} coins.` }
  }

  adjustCoins.run(-cost, username)
  const result = play()

  if (result.payout > 0) {
    adjustCoins.run(result.payout, username)
  }

  return {
    game: { cost, ...result },
    user: publicUser(getUser.get(username)),
  }
}

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

    if (request.method === 'GET' && url.pathname === '/api/session') {
      const username = getSessionUsername(request)
      const user = username ? getUser.get(username) : null

      if (!user) {
        sendJson(response, 401, { error: 'Session expired.' })
        return
      }

      await ensureUserWallet(username)
      sendJson(response, 200, { user: publicUser(getUser.get(username)) })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/game-settings') {
      sendJson(response, 200, { settings: getGameSettings() })
      return
    }

    if (request.method === 'PATCH' && url.pathname === '/api/game-settings') {
      if (getSessionUsername(request) !== adminUsername) {
        sendJson(response, 403, { error: 'Admin session required.' })
        return
      }

      const body = await readJson(request)

      for (const setting of Object.keys(defaultGameSettings)) {
        if (Object.hasOwn(body, setting)) {
          setGameSetting.run(setting, normalizeSettingValue(body[setting]))
        }
      }

      sendJson(response, 200, { settings: getGameSettings() })
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

      const walletAddress = await createUncCoinWallet(username)
      createUser.run(username, hashPassword(password), walletAddress, walletAddress ? Date.now() : 0)
      sendJson(response, 201, { user: publicUser(getUser.get(username)), token: createSession(username) })
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

      await ensureUserWallet(username)
      sendJson(response, 200, { user: publicUser(getUser.get(username)), token: createSession(username) })
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

      if (request.method === 'DELETE' && !action) {
        if (getSessionUsername(request) !== adminUsername) {
          sendJson(response, 403, { error: 'Admin session required.' })
          return
        }

        if (username === adminUsername) {
          sendJson(response, 400, { error: 'The admin account cannot be deleted.' })
          return
        }

        deleteUser.run(username)
        for (const [token, sessionUsername] of sessions.entries()) {
          if (sessionUsername === username) {
            sessions.delete(token)
          }
        }
        sendJson(response, 200, { ok: true })
        return
      }

      if (request.method === 'PATCH' && action === 'coins') {
        if (getSessionUsername(request) !== adminUsername) {
          sendJson(response, 403, { error: 'Admin session required.' })
          return
        }

        const body = await readJson(request)
        const coins = Math.max(0, Math.floor(Number(body.coins) || 0))
        setCoins.run(coins, username)
        sendJson(response, 200, { user: publicUser(getUser.get(username)) })
        return
      }

      if (request.method === 'POST' && action === 'adjust-coins') {
        if (getSessionUsername(request) !== adminUsername) {
          sendJson(response, 403, { error: 'Admin session required.' })
          return
        }

        const body = await readJson(request)
        const delta = Math.floor(Number(body.delta) || 0)
        adjustCoins.run(delta, username)
        sendJson(response, 200, { user: publicUser(getUser.get(username)) })
        return
      }

      if (request.method === 'POST' && action === 'sync-wallet') {
        const sessionUsername = getSessionUsername(request)

        if (sessionUsername !== username && sessionUsername !== adminUsername) {
          sendJson(response, 403, { error: 'You can only sync your own wallet.' })
          return
        }

        await ensureUserWallet(username)
        const result = await syncWalletDepositsForUser(getUser.get(username))
        sendJson(response, 200, { ...result, user: publicUser(getUser.get(username)) })
        return
      }

      if (request.method === 'POST' && action === 'withdraw') {
        if (getSessionUsername(request) !== username) {
          sendJson(response, 403, { error: 'You can only withdraw from your own account.' })
          return
        }

        if (!hasUncCoinConfig() || !uncCoinHouseAddress) {
          sendJson(response, 503, { error: 'UncCoin withdrawal is not configured.' })
          return
        }

        const body = await readJson(request)
        const receiverAddress = String(body.receiverAddress ?? '').trim()
        const amount = Math.floor(Number(body.amount) || 0)
        const fee = Math.max(0, Math.floor(Number(body.fee) || 0))

        if (!receiverAddress) {
          sendJson(response, 400, { error: 'Receiver wallet address is required.' })
          return
        }

        if (amount <= 0) {
          sendJson(response, 400, { error: 'Withdrawal amount must be positive.' })
          return
        }

        const debitResult = debitCoins.run(amount, username, amount)

        if (debitResult.changes === 0) {
          sendJson(response, 409, { error: 'Insufficient balance.' })
          return
        }

        try {
          const transaction = await uncCoinRequest('/api/transactions', {
            method: 'POST',
            body: JSON.stringify({
              sender_address: uncCoinHouseAddress,
              receiver_address: receiverAddress,
              amount: String(amount),
              fee: String(fee),
            }),
          })
          sendJson(response, 200, {
            ok: true,
            transaction,
            user: publicUser(getUser.get(username)),
          })
        } catch (error) {
          adjustCoins.run(amount, username)
          sendJson(response, 502, {
            error: error instanceof Error ? error.message : 'Withdrawal failed.',
            user: publicUser(getUser.get(username)),
          })
        }
        return
      }

      if (request.method === 'POST' && action === 'play') {
        if (getSessionUsername(request) !== username) {
          sendJson(response, 403, { error: 'You can only play from your own account.' })
          return
        }

        const body = await readJson(request)
        const settings = getGameSettings()
        const game = String(body.game ?? '')
        let result

        if (game === 'slots') {
          result = runCoinGame(username, settings.slotsCost, () => {
            const reels = Array.from(
              { length: 3 },
              () => slotSymbols[Math.floor(Math.random() * slotSymbols.length)],
            )
            const uniqueSymbols = new Set(reels).size
            const payout = uniqueSymbols === 1
              ? settings.slotsTriplePayout
              : uniqueSymbols === 2
                ? settings.slotsPairPayout
                : 0

            return { payout, reels }
          })
        } else if (game === 'flip') {
          result = runCoinGame(username, settings.flipCost, () => {
            const pick = String(body.pick ?? '')
            const face = pickRandomCoinFace()
            return { payout: face === pick ? settings.flipPayout : 0, face, pick }
          })
        } else if (game === 'highLow') {
          result = runCoinGame(username, settings.highLowCost, () => {
            const guess = String(body.guess ?? pickRandomHighLowGuess())
            const startCard = Math.max(1, Math.min(13, Math.floor(Number(body.startCard) || 1)))
            const nextCard = Math.ceil(Math.random() * 13)
            const won = guess === 'higher' ? nextCard > startCard : nextCard < startCard

            return {
              payout: won ? settings.highLowPayout : 0,
              guess,
              startCard,
              nextCard,
            }
          })
        } else if (game === 'dice') {
          result = runCoinGame(username, settings.diceCost, () => {
            const roll = Math.ceil(Math.random() * 6)
            const payout = roll === 6
              ? settings.diceSixPayout
              : roll >= 4
                ? settings.diceHighPayout
                : 0

            return { payout, roll }
          })
        } else if (game === 'lucky') {
          result = runCoinGame(username, settings.luckyCost, () => {
            const pick = Math.max(1, Math.min(3, Math.floor(Number(body.pick) || pickRandomLuckyNumber())))
            const number = pickRandomLuckyNumber()

            return { payout: number === pick ? settings.luckyPayout : 0, number, pick }
          })
        } else if (game === 'flax') {
          const user = getUser.get(username)

          if (user.coins < settings.flaxCost) {
            sendJson(response, 400, { error: `This game costs ${settings.flaxCost.toLocaleString()} coins.` })
            return
          }

          adjustCoins.run(-settings.flaxCost, username)
          const ticket = createFlaxTicket(settings)
          activeFlaxTickets.set(username, { ticket, paidPrize: 0 })
          sendJson(response, 200, {
            user: publicUser(getUser.get(username)),
            game: {
              cost: settings.flaxCost,
              payout: 0,
              ticket: publicFlaxTicket(ticket),
            },
          })
          return
        } else {
          sendJson(response, 400, { error: 'Unknown game.' })
          return
        }

        if (result.error) {
          sendJson(response, 400, { error: result.error })
          return
        }

        sendJson(response, 200, result)
        return
      }

      if (request.method === 'POST' && action === 'flax-scratch') {
        if (getSessionUsername(request) !== username) {
          sendJson(response, 403, { error: 'You can only scratch your own ticket.' })
          return
        }

        const activeTicket = activeFlaxTickets.get(username)

        if (!activeTicket) {
          sendJson(response, 400, { error: 'No active FLAX ticket.' })
          return
        }

        const body = await readJson(request)

        if (body.all) {
          activeTicket.ticket = activeTicket.ticket.map((square) => ({ ...square, scratched: true }))
        } else {
          const squareId = Math.floor(Number(body.squareId))
          activeTicket.ticket = activeTicket.ticket.map((square) => (
            square.id === squareId ? { ...square, scratched: true } : square
          ))
        }

        const payout = activeTicket.paidPrize === 0 ? getFlaxPayout(activeTicket.ticket) : 0

        if (payout > 0) {
          activeTicket.paidPrize = payout
          adjustCoins.run(payout, username)
        }

        const isFinished = activeTicket.ticket.every((square) => square.scratched)

        if (isFinished) {
          activeFlaxTickets.delete(username)
        } else {
          activeFlaxTickets.set(username, activeTicket)
        }

        sendJson(response, 200, {
          user: publicUser(getUser.get(username)),
          game: {
            ticket: publicFlaxTicket(activeTicket.ticket),
            payout,
            paidPrize: activeTicket.paidPrize,
            finished: isFinished,
          },
        })
        return
      }

      if (request.method === 'POST' && action === 'password') {
        if (getSessionUsername(request) !== username) {
          sendJson(response, 403, { error: 'You can only change your own password.' })
          return
        }

        const body = await readJson(request)
        const currentPassword = String(body.currentPassword ?? '')
        const nextPassword = String(body.nextPassword ?? '')
        const user = getUserWithPassword.get(username)

        if (user.password_hash !== hashPassword(currentPassword)) {
          sendJson(response, 401, { error: 'Current password is wrong.' })
          return
        }

        if (nextPassword.length < 4) {
          sendJson(response, 400, { error: 'Password needs at least 4 characters.' })
          return
        }

        setPassword.run(hashPassword(nextPassword), username)
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

if (hasUncCoinConfig()) {
  syncAllWalletDeposits().catch((error) => console.error('Wallet deposit sync failed:', error))
  setInterval(() => {
    syncAllWalletDeposits().catch((error) => console.error('Wallet deposit sync failed:', error))
  }, uncDepositPollMs)
}
