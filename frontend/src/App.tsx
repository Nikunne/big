import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react'
import heroImg from './assets/hero.png'
import './App.css'

type UserRecord = {
  username: string
  coins: number
  lastClaimAt: number
}

type AuthMode = 'login' | 'signup'
type GameResult = {
  title: string
  detail: string
}
type GameName = 'slots' | 'flip' | 'highLow' | 'dice' | 'lucky'
type FloatingDelta = {
  id: number
  game: GameName
  amount: number
}

const SESSION_STORAGE_KEY = 'bigdick-fyi-current-user'
const CLAIM_COOLDOWN_MS = 3000
const EMAIL_ADDRESS = 'contact@bigdick.fyi'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
const SLOT_SYMBOLS = ['BD', 'FYI', '1000', '!!!', '777']
const GAME_HELP: Record<GameName, { title: string; description: string }> = {
  slots: {
    title: 'Slots',
    description: 'Costs 100 coins. Three matching reels pay 1200. Two matching reels pay 250.',
  },
  flip: {
    title: 'Coin flip',
    description: 'Costs 100 coins. Pick BD or FYI. If the coin lands on your pick, you get 220.',
  },
  highLow: {
    title: 'High low',
    description: 'Costs 150 coins. Guess if the next card will be higher or lower. Correct pays 360.',
  },
  dice: {
    title: 'Dice roll',
    description: 'Costs 200 coins. Roll a six to get 900. Roll four or five to get 320.',
  },
  lucky: {
    title: 'Lucky pick',
    description: 'Costs 250 coins. Pick 1, 2, or 3. If the machine picks the same number, you get 650.',
  },
}

const normalizeUsername = (username: string) => username.trim().toLowerCase()

const apiRequest = async <ResponseBody,>(path: string, options: RequestInit = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error ?? 'Request failed.')
  }

  return body as ResponseBody
}

function App() {
  const [posterRotation, setPosterRotation] = useState(0)
  const [users, setUsers] = useState<UserRecord[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(true)
  const [currentUsername, setCurrentUsername] = useState(
    () => window.localStorage.getItem(SESSION_STORAGE_KEY) ?? '',
  )
  const [routePath, setRoutePath] = useState(() => window.location.pathname)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authUsername, setAuthUsername] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [slotReels, setSlotReels] = useState(['BD', 'FYI', '777'])
  const [coinFace, setCoinFace] = useState('BD')
  const [highLowCard, setHighLowCard] = useState(() => Math.ceil(Math.random() * 13))
  const [diceRoll, setDiceRoll] = useState(6)
  const [luckyNumber, setLuckyNumber] = useState(1)
  const [activeHelp, setActiveHelp] = useState<GameName | ''>('')
  const [gameResult, setGameResult] = useState<GameResult>({
    title: 'Games waiting',
    detail: 'Grab coins, pick a game, press a button.',
  })
  const [adminCoinInputs, setAdminCoinInputs] = useState<Record<string, string>>({})
  const [floatingDeltas, setFloatingDeltas] = useState<FloatingDelta[]>([])
  const [animatingGames, setAnimatingGames] = useState<Record<GameName, boolean>>({
    slots: false,
    flip: false,
    highLow: false,
    dice: false,
    lucky: false,
  })
  const gameLocks = useRef<Record<GameName, boolean>>({
    slots: false,
    flip: false,
    highLow: false,
    dice: false,
    lucky: false,
  })
  const badges = ['Certified oversized vibe', 'Questionable domain', 'Very official', 'Coin faucet active']
  const details = [
    'A small internet monument with a large amount of confidence.',
    'Built for late-night clicks, accidental bookmarks, and serious unseriousness.',
    'No corporate manifesto. Just loud colors, polite chaos, and one email address.',
  ]
  const currentUser = users.find((user) => user.username === currentUsername)
  const menuItems = currentUser
    ? ['Home', 'Flavor', 'Evidence', 'Buy Domain', 'Contact']
    : ['Home', 'Flavor', 'Evidence', 'Buy Domain', 'Login', 'Contact']
  const routedUsername = routePath.match(/^\/users\/([^/]+)\/?$/)?.[1] ?? ''
  const routedUser = users.find((user) => user.username === decodeURIComponent(routedUsername))
  const activeCasinoUser = routedUser ?? currentUser
  const claimWaitMs = activeCasinoUser
    ? Math.max(0, CLAIM_COOLDOWN_MS - (now - activeCasinoUser.lastClaimAt))
    : CLAIM_COOLDOWN_MS
  const canClaimCoins = claimWaitMs === 0

  const posterStyle = {
    '--poster-spin': `${posterRotation}deg`,
  } as CSSProperties

  const upsertUser = (nextUser: UserRecord) => {
    setUsers((storedUsers) => {
      const userExists = storedUsers.some((user) => user.username === nextUser.username)

      if (!userExists) {
        return [...storedUsers, nextUser].sort((firstUser, secondUser) =>
          firstUser.username.localeCompare(secondUser.username),
        )
      }

      return storedUsers.map((user) => (
        user.username === nextUser.username ? nextUser : user
      ))
    })
  }

  useEffect(() => {
    const handlePopState = () => setRoutePath(window.location.pathname)

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    let isMounted = true

    apiRequest<{ users: UserRecord[] }>('/api/users')
      .then(({ users: loadedUsers }) => {
        if (isMounted) {
          setUsers(loadedUsers)
          setIsLoadingUsers(false)
        }
      })
      .catch(() => {
        if (isMounted) {
          setAuthMessage('Could not load users from the database.')
          setIsLoadingUsers(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const closeHelp = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveHelp('')
      }
    }

    window.addEventListener('keydown', closeHelp)
    return () => window.removeEventListener('keydown', closeHelp)
  }, [])

  const goToPath = (path: string) => {
    window.history.pushState(null, '', path)
    setRoutePath(path)
    window.scrollTo({ top: 0 })
  }

  const spinPoster = () => {
    setPosterRotation((rotation) => rotation + 1080 + Math.floor(Math.random() * 720))
  }

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const username = normalizeUsername(authUsername)
    const password = authPassword

    if (!/^[a-z0-9_]{3,18}$/.test(username)) {
      setAuthMessage('Use 3-18 letters, numbers, or underscores.')
      return
    }

    if (password.length < 4) {
      setAuthMessage('Password needs at least 4 characters.')
      return
    }

    try {
      const endpoint = authMode === 'signup' ? '/api/signup' : '/api/login'
      const { user } = await apiRequest<{ user: UserRecord }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })

      upsertUser(user)
      setCurrentUsername(username)
      window.localStorage.setItem(SESSION_STORAGE_KEY, username)
      setAuthPassword('')
      setAuthMessage(authMode === 'signup' ? 'Account created.' : 'Logged in.')
      goToPath(`/users/${username}`)
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Login failed.')
    }
  }

  const handleLogout = () => {
    setCurrentUsername('')
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    goToPath('/')
  }

  const claimCoins = async () => {
    if (!activeCasinoUser || !canClaimCoins || activeCasinoUser.username !== currentUsername) {
      return
    }

    try {
      const { user } = await apiRequest<{ user: UserRecord }>(
        `/api/users/${encodeURIComponent(activeCasinoUser.username)}/claim`,
        { method: 'POST' },
      )
      upsertUser(user)
      setNow(Date.now())
    } catch (error) {
      setGameResult({
        title: 'Claim failed',
        detail: error instanceof Error ? error.message : 'Could not claim coins.',
      })
    }
  }

  const updateCoins = async (username: string, coinDelta: number) => {
    setUsers((storedUsers) => {
      return storedUsers.map((user) => {
        if (user.username !== username) {
          return user
        }

        return {
          ...user,
          coins: Math.max(0, user.coins + coinDelta),
        }
      })
    })

    try {
      const { user } = await apiRequest<{ user: UserRecord }>(
        `/api/users/${encodeURIComponent(username)}/adjust-coins`,
        {
          method: 'POST',
          body: JSON.stringify({ delta: coinDelta }),
        },
      )
      upsertUser(user)
    } catch {
      const { users: loadedUsers } = await apiRequest<{ users: UserRecord[] }>('/api/users')
      setUsers(loadedUsers)
    }
  }

  const setUserCoins = async (username: string, coins: number) => {
    const normalizedCoins = Math.max(0, Math.floor(coins))

    setUsers((storedUsers) => {
      return storedUsers.map((user) => {
        if (user.username !== username) {
          return user
        }

        return {
          ...user,
          coins: normalizedCoins,
        }
      })
    })

    try {
      const { user } = await apiRequest<{ user: UserRecord }>(
        `/api/users/${encodeURIComponent(username)}/coins`,
        {
          method: 'PATCH',
          body: JSON.stringify({ coins: normalizedCoins }),
        },
      )
      upsertUser(user)
    } catch {
      const { users: loadedUsers } = await apiRequest<{ users: UserRecord[] }>('/api/users')
      setUsers(loadedUsers)
    }
  }

  const adjustUserCoins = (username: string, coinDelta: number) => {
    updateCoins(username, coinDelta)
  }

  const emitFloatingDelta = (game: GameName, amount: number, delay = 0) => {
    window.setTimeout(() => {
      const id = Date.now() + Math.random()
      setFloatingDeltas((deltas) => [...deltas, { id, game, amount }])
      window.setTimeout(() => {
        setFloatingDeltas((deltas) => deltas.filter((delta) => delta.id !== id))
      }, 1050)
    }, delay)
  }

  const renderFloatingDeltas = (game: GameName) => (
    <div className="floating-deltas" aria-hidden="true">
      {floatingDeltas
        .filter((delta) => delta.game === game)
        .map((delta) => (
          <span
            className={delta.amount > 0 ? 'coin-delta win' : 'coin-delta loss'}
            key={delta.id}
          >
            {delta.amount > 0 ? '+' : ''}
            {delta.amount}
          </span>
        ))}
    </div>
  )

  const renderGameHelpButton = (game: GameName) => (
    <button
      className="game-help-button"
      type="button"
      aria-label={`Show ${GAME_HELP[game].title} rules`}
      onClick={() => setActiveHelp(game)}
    >
      ?
    </button>
  )

  const canPlayGame = (cost: number) => {
    if (!activeCasinoUser || activeCasinoUser.username !== currentUsername) {
      setGameResult({
        title: 'Log in first',
        detail: 'Only the owner of this user page can play games.',
      })
      return false
    }

    if (activeCasinoUser.coins < cost) {
      setGameResult({
        title: 'Need more coins',
        detail: `This game costs ${cost.toLocaleString()} coins.`,
      })
      return false
    }

    return true
  }

  const beginGame = (game: GameName, cost: number) => {
    if (gameLocks.current[game] || !canPlayGame(cost) || !activeCasinoUser) {
      return ''
    }

    gameLocks.current[game] = true
    setAnimatingGames((games) => ({ ...games, [game]: true }))
    emitFloatingDelta(game, -cost)
    updateCoins(activeCasinoUser.username, -cost)
    setGameResult({
      title: 'Bet placed',
      detail: `-${cost} coins. Result lands in 2 seconds.`,
    })

    return activeCasinoUser.username
  }

  const finishGame = (game: GameName) => {
    gameLocks.current[game] = false
    setAnimatingGames((games) => ({ ...games, [game]: false }))
  }

  const playSlots = () => {
    const cost = 100

    const username = beginGame('slots', cost)

    if (!username) {
      return
    }

    window.setTimeout(() => {
      const reels = Array.from(
        { length: 3 },
        () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
      )
      const uniqueSymbols = new Set(reels).size
      const payout = uniqueSymbols === 1 ? 1200 : uniqueSymbols === 2 ? 250 : 0

      setSlotReels(reels)
      if (payout > 0) {
        emitFloatingDelta('slots', payout)
        updateCoins(username, payout)
      }
      setGameResult({
        title: payout > 0 ? 'Slots paid' : 'Slots missed',
        detail: payout > 0
          ? `Spent ${cost}, won ${payout}. Net +${payout - cost}.`
          : `Spent ${cost}. The reels kept the coins.`,
      })
      finishGame('slots')
    }, 2000)
  }

  const playCoinFlip = (pick: string) => {
    const cost = 100

    const username = beginGame('flip', cost)

    if (!username) {
      return
    }

    window.setTimeout(() => {
      const face = Math.random() > 0.5 ? 'BD' : 'FYI'
      const won = face === pick
      const payout = won ? 220 : 0

      setCoinFace(face)
      if (payout > 0) {
        emitFloatingDelta('flip', payout)
        updateCoins(username, payout)
      }
      setGameResult({
        title: won ? 'Flip hit' : 'Flip missed',
        detail: `You picked ${pick}. Coin landed ${face}. Net ${won ? `+${payout - cost}` : `-${cost}`}.`,
      })
      finishGame('flip')
    }, 2000)
  }

  const playHighLow = (guess: 'higher' | 'lower') => {
    const cost = 150

    const username = beginGame('highLow', cost)

    if (!username) {
      return
    }

    const startCard = highLowCard

    window.setTimeout(() => {
      const nextCard = Math.ceil(Math.random() * 13)
      const won = guess === 'higher' ? nextCard > startCard : nextCard < startCard
      const payout = won ? 360 : 0

      if (payout > 0) {
        emitFloatingDelta('highLow', payout)
        updateCoins(username, payout)
      }
      setGameResult({
        title: won ? 'Good read' : nextCard === startCard ? 'Push? No mercy' : 'Bad read',
        detail: `${startCard} to ${nextCard}. Spent ${cost}, ${won ? `won ${payout}` : 'won 0'}.`,
      })
      setHighLowCard(nextCard)
      finishGame('highLow')
    }, 2000)
  }

  const playDice = () => {
    const cost = 200
    const username = beginGame('dice', cost)

    if (!username) {
      return
    }

    window.setTimeout(() => {
      const roll = Math.ceil(Math.random() * 6)
      const payout = roll === 6 ? 900 : roll >= 4 ? 320 : 0

      setDiceRoll(roll)
      if (payout > 0) {
        emitFloatingDelta('dice', payout)
        updateCoins(username, payout)
      }
      setGameResult({
        title: payout > 0 ? 'Dice paid' : 'Dice missed',
        detail: `Rolled ${roll}. Spent ${cost}, ${payout > 0 ? `won ${payout}` : 'won 0'}.`,
      })
      finishGame('dice')
    }, 2000)
  }

  const playLucky = (pick: number) => {
    const cost = 250
    const username = beginGame('lucky', cost)

    if (!username) {
      return
    }

    window.setTimeout(() => {
      const number = Math.ceil(Math.random() * 3)
      const won = number === pick
      const payout = won ? 650 : 0

      setLuckyNumber(number)
      if (payout > 0) {
        emitFloatingDelta('lucky', payout)
        updateCoins(username, payout)
      }
      setGameResult({
        title: won ? 'Lucky hit' : 'Lucky missed',
        detail: `You picked ${pick}. Machine picked ${number}. ${won ? `Won ${payout}` : 'Won 0'}.`,
      })
      finishGame('lucky')
    }, 2000)
  }

  const copyEmail = async () => {
    await navigator.clipboard.writeText(EMAIL_ADDRESS)
    setCopyMessage('Copied')
    window.setTimeout(() => setCopyMessage(''), 1400)
  }

  const renderAuthPanel = () => (
    <section className="casino-login" id="login" aria-labelledby="login-title">
      <div className="casino-machine" aria-hidden="true">
        <div className="machine-top">Coin Palace</div>
        <div className="slot-window">
          <span>FYI</span>
          <span>1000</span>
          <span>BD</span>
        </div>
        <div className="machine-lights">
          <i></i>
          <i></i>
          <i></i>
          <i></i>
          <i></i>
        </div>
      </div>

      <form className="auth-panel" onSubmit={handleAuthSubmit}>
        <p className="eyebrow">Not-money casino login</p>
        <h2 id="login-title">{authMode === 'login' ? 'Log in' : 'Create user'}</h2>
        <label>
          Username
          <input
            autoComplete="username"
            maxLength={18}
            value={authUsername}
            onChange={(event) => setAuthUsername(event.target.value)}
            placeholder="username"
          />
        </label>
        <label>
          Password
          <input
            autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
            type="password"
            value={authPassword}
            onChange={(event) => setAuthPassword(event.target.value)}
            placeholder="password"
          />
        </label>
        <button className="primary-action" type="submit">
          {authMode === 'login' ? 'Enter casino' : 'Make account'}
        </button>
        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            setAuthMode((mode) => (mode === 'login' ? 'signup' : 'login'))
            setAuthMessage('')
          }}
        >
          {authMode === 'login' ? 'Need an account?' : 'Already have one?'}
        </button>
        {authMessage && <p className="form-message">{authMessage}</p>}
      </form>
    </section>
  )

  const renderCasinoPage = () => {
    if (isLoadingUsers) {
      return (
        <main className="user-page">
          <section className="missing-user">
            <p className="eyebrow">Loading database</p>
            <h1>Fetching users</h1>
          </section>
        </main>
      )
    }

    if (!activeCasinoUser) {
      return (
        <main className="user-page">
          <section className="missing-user">
            <p className="eyebrow">No user found</p>
            <h1>Try logging in</h1>
            <button className="primary-action" type="button" onClick={() => goToPath('/')}>
              Back home
            </button>
          </section>
        </main>
      )
    }

    const isOwnPage = activeCasinoUser.username === currentUsername
    const canAdminUsers = currentUsername === 'niklas'

    return (
      <main className="user-page">
        <nav className="site-nav user-nav" aria-label="User navigation">
          <button className="brand-mark nav-button" type="button" onClick={() => goToPath('/')}>
            BD.FYI
          </button>
          <div className="nav-links">
            <button type="button" onClick={() => goToPath('/')}>
              Home
            </button>
            {isOwnPage && (
              <button type="button" onClick={handleLogout}>
                Log out
              </button>
            )}
          </div>
        </nav>

        <section className="casino-floor" aria-labelledby="casino-title">
          <div className="casino-copy">
            <p className="eyebrow">User casino</p>
            <h1 id="casino-title">{activeCasinoUser.username}</h1>
            <p className="lede">Fake coins, real button, zero financial consequences.</p>
          </div>

          <div className="coin-vault">
            <span>Balance</span>
            <strong>{activeCasinoUser.coins.toLocaleString()}</strong>
            <em>coins</em>
            <button
              className="claim-button"
              type="button"
              disabled={!isOwnPage || !canClaimCoins}
              onClick={claimCoins}
            >
              {isOwnPage
                ? canClaimCoins
                  ? 'Get free 1000 coins'
                  : `Wait ${(claimWaitMs / 1000).toFixed(1)}s`
                : 'View only'}
            </button>
          </div>
        </section>

        <section className="game-grid" aria-label="Casino games">
          <article className={`game-card slots-game ${animatingGames.slots ? 'is-playing' : ''}`}>
            {renderFloatingDeltas('slots')}
            <div className="game-balance-badge" aria-live="polite">
              <strong>{activeCasinoUser.coins.toLocaleString()} coins</strong>
            </div>
            <div className="game-heading">
              <p className="eyebrow">Cost: 100</p>
              <h2>Slots</h2>
              {renderGameHelpButton('slots')}
            </div>
            <div className="game-reels" aria-label={`Slot result ${slotReels.join(' ')}`}>
              {slotReels.map((reel, index) => (
                <span key={`${reel}-${index}`}>{reel}</span>
              ))}
            </div>
            <p>Three match pays 1200. Two match pays 250.</p>
            <button className="game-button" type="button" disabled={!isOwnPage || animatingGames.slots} onClick={playSlots}>
              {animatingGames.slots ? 'Spinning' : 'Spin'}
            </button>
          </article>

          <article className={`game-card flip-game ${animatingGames.flip ? 'is-playing' : ''}`}>
            {renderFloatingDeltas('flip')}
            <div className="game-balance-badge" aria-live="polite">
              <strong>{activeCasinoUser.coins.toLocaleString()} coins</strong>
            </div>
            <div className="game-heading">
              <p className="eyebrow">Cost: 100</p>
              <h2>Coin flip</h2>
              {renderGameHelpButton('flip')}
            </div>
            <div className="coin-display">{coinFace}</div>
            <p>Pick a side. Correct pays 220.</p>
            <div className="game-actions">
              <button className="game-button" type="button" disabled={!isOwnPage || animatingGames.flip} onClick={() => playCoinFlip('BD')}>
                BD
              </button>
              <button className="game-button alt" type="button" disabled={!isOwnPage || animatingGames.flip} onClick={() => playCoinFlip('FYI')}>
                FYI
              </button>
            </div>
          </article>

          <article className={`game-card high-low-game ${animatingGames.highLow ? 'is-playing' : ''}`}>
            {renderFloatingDeltas('highLow')}
            <div className="game-balance-badge" aria-live="polite">
              <strong>{activeCasinoUser.coins.toLocaleString()} coins</strong>
            </div>
            <div className="game-heading">
              <p className="eyebrow">Cost: 150</p>
              <h2>High low</h2>
              {renderGameHelpButton('highLow')}
            </div>
            <div className="card-display">{highLowCard}</div>
            <p>Guess the next card. Correct pays 360.</p>
            <div className="game-actions">
              <button className="game-button" type="button" disabled={!isOwnPage || animatingGames.highLow} onClick={() => playHighLow('higher')}>
                Higher
              </button>
              <button className="game-button alt" type="button" disabled={!isOwnPage || animatingGames.highLow} onClick={() => playHighLow('lower')}>
                Lower
              </button>
            </div>
          </article>

          <article className={`game-card dice-game ${animatingGames.dice ? 'is-playing' : ''}`}>
            {renderFloatingDeltas('dice')}
            <div className="game-balance-badge" aria-live="polite">
              <strong>{activeCasinoUser.coins.toLocaleString()} coins</strong>
            </div>
            <div className="game-heading">
              <p className="eyebrow">Cost: 200</p>
              <h2>Dice roll</h2>
              {renderGameHelpButton('dice')}
            </div>
            <div className="dice-display">{diceRoll}</div>
            <p>Six pays 900. Four or five pays 320.</p>
            <button className="game-button" type="button" disabled={!isOwnPage || animatingGames.dice} onClick={playDice}>
              {animatingGames.dice ? 'Rolling' : 'Roll'}
            </button>
          </article>

          <article className={`game-card lucky-game ${animatingGames.lucky ? 'is-playing' : ''}`}>
            {renderFloatingDeltas('lucky')}
            <div className="game-balance-badge" aria-live="polite">
              <strong>{activeCasinoUser.coins.toLocaleString()} coins</strong>
            </div>
            <div className="game-heading">
              <p className="eyebrow">Cost: 250</p>
              <h2>Lucky pick</h2>
              {renderGameHelpButton('lucky')}
            </div>
            <div className="lucky-display">{luckyNumber}</div>
            <p>Pick one number. Match the machine for 650.</p>
            <div className="game-actions three-actions">
              <button
                className="game-button"
                type="button"
                disabled={!isOwnPage || animatingGames.lucky}
                onClick={() => playLucky(1)}
              >
                1
              </button>
              <button
                className="game-button"
                type="button"
                disabled={!isOwnPage || animatingGames.lucky}
                onClick={() => playLucky(2)}
              >
                2
              </button>
              <button
                className="game-button"
                type="button"
                disabled={!isOwnPage || animatingGames.lucky}
                onClick={() => playLucky(3)}
              >
                3
              </button>
            </div>
          </article>

          <aside className="game-result" aria-live="polite">
            <span>Result board</span>
            <strong>{gameResult.title}</strong>
            <p>{gameResult.detail}</p>
          </aside>
        </section>

        {activeHelp && (
          <div className="help-overlay" role="presentation" onClick={() => setActiveHelp('')}>
            <section
              className="help-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="help-title"
            >
              <p className="eyebrow">Game rules</p>
              <h2 id="help-title">{GAME_HELP[activeHelp].title}</h2>
              <p>{GAME_HELP[activeHelp].description}</p>
            </section>
          </div>
        )}

        {canAdminUsers && (
          <section className="admin-panel" aria-labelledby="admin-title">
            <div className="admin-header">
              <p className="eyebrow">Niklas only</p>
              <h2 id="admin-title">Admin panel</h2>
            </div>

            <div className="admin-users">
              {users.map((user) => {
                const inputValue = adminCoinInputs[user.username] ?? String(user.coins)

                return (
                  <article className="admin-user" key={user.username}>
                    <div>
                      <strong>{user.username}</strong>
                      <span>{user.coins.toLocaleString()} coins</span>
                    </div>
                    <label>
                      Set coins
                      <input
                        inputMode="numeric"
                        min="0"
                        type="number"
                        value={inputValue}
                        onChange={(event) =>
                          setAdminCoinInputs((inputs) => ({
                            ...inputs,
                            [user.username]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <div className="admin-actions">
                      <button
                        type="button"
                        onClick={() => adjustUserCoins(user.username, 1000)}
                      >
                        +1000
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustUserCoins(user.username, -1000)}
                      >
                        -1000
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserCoins(user.username, Number(inputValue) || 0)}
                      >
                        Save
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}
      </main>
    )
  }

  if (routePath.startsWith('/users/')) {
    return renderCasinoPage()
  }

  return (
    <main>
      <section className="hero-shell" id="home">
        <nav className="site-nav" aria-label="Primary navigation">
          <a className="brand-mark" href="#home" aria-label="bigdick.fyi home">
            BD.FYI
          </a>
          <div className="nav-links">
            {menuItems.map((item) => (
              <a key={item} href={`#${item.toLowerCase().replaceAll(' ', '-')}`}>
                {item}
              </a>
            ))}
            {currentUser && (
              <button type="button" onClick={() => goToPath(`/users/${currentUser.username}`)}>
                {currentUser.username}
              </button>
            )}
          </div>
        </nav>

        <div className="ticker" aria-hidden="true">
          <span>bigdick.fyi // oddly useful // aggressively online // send snacks //</span>
          <span>bigdick.fyi // oddly useful // aggressively online // send snacks //</span>
        </div>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Information you did not request</p>
            <h1>bigdick.fyi</h1>
            <p className="lede">
              A tiny official-looking website for an extremely unserious domain.
              Bring questions, rumors, compliments, tiny business cards, and
              tasteful nonsense.
            </p>
            <div className="hero-actions">
              <a className="primary-action" href={`mailto:${EMAIL_ADDRESS}`}>
                {EMAIL_ADDRESS}
              </a>
              {currentUser ? (
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => goToPath(`/users/${currentUser.username}`)}
                >
                  Enter coin palace
                </button>
              ) : (
                <a className="secondary-action" href="#login">
                  Enter coin palace
                </a>
              )}
            </div>
          </div>

          <button
            className="chaos-poster"
            type="button"
            onClick={spinPoster}
            style={posterStyle}
            aria-label="Spin the wheel"
          >
            <div className="sunburst"></div>
            <img src={heroImg} alt="" />
            <div className="poster-label label-one">100% fyi</div>
            <div className="poster-label label-two">open 25/8</div>
            <div className="poster-label label-three">big mood desk</div>
          </button>
        </div>
      </section>

      <section className="badge-strip" id="flavor" aria-label="Site highlights">
        {badges.map((badge) => (
          <div className="badge" key={badge}>
            {badge}
          </div>
        ))}
      </section>

      <section className="content-grid" id="evidence">
        <article className="feature-panel tall">
          <span className="panel-number">01</span>
          <h2>What is this?</h2>
          <p>
            A shiny internet placard wearing sunglasses indoors. It is here to
            answer almost nothing and still feel weirdly complete.
          </p>
          <div className="stamp">real website</div>
        </article>

        <article className="feature-panel checker">
          <span className="panel-number">02</span>
          <h2>Why so loud?</h2>
          <p>
            The domain asked politely, then kicked the door open with a confetti
            cannon and a fax machine full of glitter.
          </p>
        </article>

        <aside className="notice-stack" aria-label="Notices">
          {details.map((detail) => (
            <p key={detail}>{detail}</p>
          ))}
        </aside>
      </section>

      <section className="domain-sale" id="buy-domain" aria-labelledby="domain-sale-title">
        <div className="sale-copy">
          <p className="eyebrow">Premium questionable property</p>
          <h2 id="domain-sale-title">Buy bigdick.fyi</h2>
          <p>
            Own the loudest tiny corner of the internet for <strong>$10,000</strong>.
            One domain. Infinite raised eyebrows. Zero boring business cards.
          </p>
        </div>
        <a className="price-ticket" href="mailto:contact@bigdick.fyi?subject=I%20want%20to%20buy%20bigdick.fyi">
          <span>Asking price</span>
          <strong>$10,000</strong>
          <em>serious unserious offers accepted</em>
        </a>
      </section>

      {!currentUser && renderAuthPanel()}

      <section className="contact-zone" id="contact">
        <div>
          <p className="eyebrow">Human contact portal</p>
          <h2>Send a message. Make it count, or at least make it weird.</h2>
        </div>
        <div className="mail-actions">
          <a className="mail-card" href={`mailto:${EMAIL_ADDRESS}`}>
            {EMAIL_ADDRESS}
          </a>
          <button className="copy-mail" type="button" onClick={copyEmail} aria-label="Copy email address">
            Copy
          </button>
          {copyMessage && <span className="copy-message">{copyMessage}</span>}
        </div>
      </section>
    </main>
  )
}

export default App
