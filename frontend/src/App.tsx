import { type CSSProperties, type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import heroImg from './assets/hero.png'
import './App.css'

type UserRecord = {
  username: string
  coins: number
  lastClaimAt: number
  walletAddress: string
  walletCreatedAt: number
  lastWalletCheckAt: number
}

type AuthMode = 'login' | 'signup'
type AuthResponse = {
  user: UserRecord
  token: string
}
type PlayResponse = {
  user: UserRecord
  game: {
    cost: number
    payout: number
    reels?: string[]
    face?: string
    pick?: string
    guess?: string
    startCard?: number
    nextCard?: number
    roll?: number
    number?: number
    ticket?: FlaxSquare[]
  }
}
type FlaxScratchResponse = {
  user: UserRecord
  game: {
    ticket: FlaxSquare[]
    payout: number
    paidPrize: number
    finished: boolean
  }
}
type WithdrawResponse = {
  user: UserRecord
  transaction: {
    ok?: boolean
    status?: string
  }
}
type GameResult = {
  title: string
  detail: string
}
type GameName = 'slots' | 'flip' | 'highLow' | 'dice' | 'lucky' | 'flax'
type FloatingDelta = {
  id: number
  game: GameName
  amount: number
}
type FlaxSquare = {
  id: number
  prize: number
  scratched: boolean
}
type GameSettings = {
  slotsCost: number
  slotsTriplePayout: number
  slotsPairPayout: number
  flipCost: number
  flipPayout: number
  highLowCost: number
  highLowPayout: number
  diceCost: number
  diceSixPayout: number
  diceHighPayout: number
  luckyCost: number
  luckyPayout: number
  flaxCost: number
  flaxPrizeSmall: number
  flaxPrizeMedium: number
  flaxPrizeLarge: number
  flaxPrizeHuge: number
  flaxPrizeJackpot: number
}

const SESSION_STORAGE_KEY = 'bigdick-fyi-current-user'
const SESSION_TOKEN_STORAGE_KEY = 'bigdick-fyi-session-token'
const FLAX_AUTOREVEAL_MS = 500
const EMAIL_ADDRESS = 'contact@bigdick.fyi'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
const SLOT_SYMBOLS = ['BD', 'FYI', '1000', '!!!', '777']
const SLOT_REEL_HEIGHT = 96
const SLOT_SPIN_DURATION_MS = 1900
const DEFAULT_GAME_SETTINGS: GameSettings = {
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
const GAME_TITLES: Record<GameName, string> = {
  slots: 'Slots',
  flip: 'Coin flip',
  highLow: 'High low',
  dice: 'Dice roll',
  lucky: 'Lucky pick',
  flax: 'FLAX-lodd',
}
const GAME_SETTING_LABELS: Record<keyof GameSettings, string> = {
  slotsCost: 'Slots cost',
  slotsTriplePayout: 'Slots 3-match payout',
  slotsPairPayout: 'Slots 2-match payout',
  flipCost: 'Coin flip cost',
  flipPayout: 'Coin flip payout',
  highLowCost: 'High low cost',
  highLowPayout: 'High low payout',
  diceCost: 'Dice roll cost',
  diceSixPayout: 'Dice 6 payout',
  diceHighPayout: 'Dice 4-5 payout',
  luckyCost: 'Lucky pick cost',
  luckyPayout: 'Lucky pick payout',
  flaxCost: 'FLAX-lodd cost',
  flaxPrizeSmall: 'FLAX prize small',
  flaxPrizeMedium: 'FLAX prize medium',
  flaxPrizeLarge: 'FLAX prize large',
  flaxPrizeHuge: 'FLAX prize huge',
  flaxPrizeJackpot: 'FLAX prize jackpot',
}

const normalizeUsername = (username: string) => username.trim().toLowerCase()

const normalizeSettingValue = (value: number) => Math.max(0, Math.floor(Number(value) || 0))

const getStoredSessionToken = () => window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY) ?? ''

const storeSession = (username: string, token: string) => {
  window.localStorage.setItem(SESSION_STORAGE_KEY, username)
  window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token)
}

const clearSession = () => {
  window.localStorage.removeItem(SESSION_STORAGE_KEY)
  window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY)
}

const getFlaxPrizes = (settings: GameSettings) => [
  { amount: settings.flaxPrizeSmall, weight: 40 },
  { amount: settings.flaxPrizeMedium, weight: 25 },
  { amount: settings.flaxPrizeLarge, weight: 18 },
  { amount: settings.flaxPrizeHuge, weight: 12 },
  { amount: settings.flaxPrizeJackpot, weight: 5 },
]

const pickRandomCoinFace = () => (Math.random() > 0.5 ? 'BD' : 'FYI')

const pickRandomHighLowGuess = (): 'higher' | 'lower' => (
  Math.random() > 0.5 ? 'higher' : 'lower'
)

const pickRandomLuckyNumber = () => Math.ceil(Math.random() * 3)

const getSlotSymbolClassName = (symbol: string) => (
  `slot-symbol slot-symbol-${symbol.toLowerCase().replaceAll('!', 'bang')}`
)

const shuffle = <Item,>(items: Item[]) => {
  const shuffledItems = [...items]

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const item = shuffledItems[index]
    shuffledItems[index] = shuffledItems[randomIndex]
    shuffledItems[randomIndex] = item
  }

  return shuffledItems
}

const pickWeightedFlaxPrize = (availablePrizes: { amount: number; weight: number }[]) => {
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

const createFlaxTicket = (settings = DEFAULT_GAME_SETTINGS) => {
  const flaxPrizes = getFlaxPrizes(settings)
  const isWinningTicket = Math.random() < 0.35
  const winningPrize = pickWeightedFlaxPrize(flaxPrizes)
  const prizes = isWinningTicket ? [winningPrize, winningPrize, winningPrize] : []
  const prizeCounts = prizes.reduce<Record<number, number>>((counts, prize) => ({
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

const apiRequest = async <ResponseBody,>(path: string, options: RequestInit = {}) => {
  const token = getStoredSessionToken()
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  const [currentUsername, setCurrentUsername] = useState('')
  const [routePath, setRoutePath] = useState(() => window.location.pathname)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authUsername, setAuthUsername] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [showPasswordPanel, setShowPasswordPanel] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [walletMessage, setWalletMessage] = useState('')
  const [withdrawAddress, setWithdrawAddress] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [showWalletHelp, setShowWalletHelp] = useState(false)
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const [gameSettings, setGameSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS)
  const [showPricePanel, setShowPricePanel] = useState(false)
  const [slotReels, setSlotReels] = useState(['BD', 'FYI', '777'])
  const [slotSpinSequences, setSlotSpinSequences] = useState<string[][]>(() => (
    slotReels.map((reel) => [...SLOT_SYMBOLS, reel])
  ))
  const [coinFace, setCoinFace] = useState('BD')
  const [highLowCard, setHighLowCard] = useState(() => Math.ceil(Math.random() * 13))
  const [diceRoll, setDiceRoll] = useState(6)
  const [luckyNumber, setLuckyNumber] = useState(1)
  const [flaxTicket, setFlaxTicket] = useState<FlaxSquare[]>(() => createFlaxTicket(DEFAULT_GAME_SETTINGS))
  const [activeHelp, setActiveHelp] = useState<GameName | ''>('')
  const [gameResult, setGameResult] = useState<GameResult>({
    title: 'Games waiting',
    detail: 'Grab coins, pick a game, press a button.',
  })
  const [adminCoinInputs, setAdminCoinInputs] = useState<Record<string, string>>({})
  const [hideZeroBalanceUsers, setHideZeroBalanceUsers] = useState(false)
  const [floatingDeltas, setFloatingDeltas] = useState<FloatingDelta[]>([])
  const [autoplayGames, setAutoplayGames] = useState<Record<GameName, boolean>>({
    slots: false,
    flip: false,
    highLow: false,
    dice: false,
    lucky: false,
    flax: false,
  })
  const [animatingGames, setAnimatingGames] = useState<Record<GameName, boolean>>({
    slots: false,
    flip: false,
    highLow: false,
    dice: false,
    lucky: false,
    flax: false,
  })
  const autoplayLocks = useRef<Record<GameName, boolean>>({
    slots: false,
    flip: false,
    highLow: false,
    dice: false,
    lucky: false,
    flax: false,
  })
  const autoplayTimeouts = useRef<Record<GameName, number | undefined>>({
    slots: undefined,
    flip: undefined,
    highLow: undefined,
    dice: undefined,
    lucky: undefined,
    flax: undefined,
  })
  const toggleZeroBalanceUsersRef = useRef<() => void>(() => {})
  const gameLocks = useRef<Record<GameName, boolean>>({
    slots: false,
    flip: false,
    highLow: false,
    dice: false,
    lucky: false,
    flax: false,
  })
  const details = [
    'A small internet monument with a large amount of confidence.',
    'Built for late-night clicks, accidental bookmarks, and serious unseriousness.',
    'No corporate manifesto. Just loud colors, polite chaos, and one email address.',
  ]
  const currentUser = users.find((user) => user.username === currentUsername)
  const menuItems = currentUser
    ? ['Home', 'Evidence', 'Buy Domain', 'Contact']
    : ['Home', 'Evidence', 'Buy Domain', 'Login', 'Contact']
  const routedUsername = routePath.match(/^\/users\/([^/]+)\/?$/)?.[1] ?? ''
  const routedUser = users.find((user) => user.username === decodeURIComponent(routedUsername))
  const activeCasinoUser = routedUser ?? currentUser
  const topUsers = [...users]
    .sort((firstUser, secondUser) => (
      secondUser.coins - firstUser.coins
      || firstUser.username.localeCompare(secondUser.username)
    ))
    .slice(0, 5)
  const activeCasinoUserRef = useRef<UserRecord | undefined>(undefined)
  const currentUsernameRef = useRef('')

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
    window.localStorage.removeItem('bigdick-fyi-users')
    window.localStorage.removeItem('bigdick-fyi-game-settings')
  }, [])

  useEffect(() => {
    let isMounted = true

    Promise.all([
      apiRequest<{ users: UserRecord[] }>('/api/users'),
      apiRequest<{ settings: GameSettings }>('/api/game-settings'),
    ])
      .then(([{ users: loadedUsers }, { settings }]) => {
        if (isMounted) {
          setUsers(loadedUsers)
          setGameSettings(settings)
          setFlaxTicket(createFlaxTicket(settings))
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
    let isMounted = true

    if (!getStoredSessionToken()) {
      clearSession()
      return () => {
        isMounted = false
      }
    }

    apiRequest<{ user: UserRecord }>('/api/session')
      .then(({ user }) => {
        if (isMounted) {
          upsertUser(user)
          setCurrentUsername(user.username)
          window.localStorage.setItem(SESSION_STORAGE_KEY, user.username)
        }
      })
      .catch(() => {
        if (isMounted) {
          clearSession()
          setCurrentUsername('')
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    activeCasinoUserRef.current = activeCasinoUser
    currentUsernameRef.current = currentUsername
  }, [activeCasinoUser, currentUsername])

  useEffect(() => {
    const timeouts = autoplayTimeouts.current

    return () => {
      Object.values(timeouts).forEach((timeout) => {
        window.clearTimeout(timeout)
      })
    }
  }, [])

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveHelp('')
        setShowPasswordPanel(false)
        setShowWalletHelp(false)
        setShowWithdrawConfirm(false)
      }

      const target = event.target
      const isTyping = target instanceof HTMLElement
        && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)

      const isPlainKey = !event.altKey && !event.ctrlKey && !event.metaKey

      if (isPlainKey && !isTyping && event.key.toLowerCase() === 'p' && currentUsernameRef.current === 'niklas') {
        setShowPricePanel((isVisible) => !isVisible)
      }

      if (isPlainKey && !isTyping && event.key.toLowerCase() === 'a' && currentUsernameRef.current === 'niklas') {
        toggleZeroBalanceUsersRef.current()
      }

      if (isPlainKey && !isTyping && event.key.toLowerCase() === 'c' && currentUsernameRef.current) {
        setShowPasswordPanel((isVisible) => !isVisible)
        setPasswordMessage('')
      }
    }

    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
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
      const { user, token } = await apiRequest<AuthResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })

      upsertUser(user)
      setCurrentUsername(user.username)
      storeSession(user.username, token)
      setAuthPassword('')
      setAuthMessage(authMode === 'signup' ? 'Account created.' : 'Logged in.')
      goToPath(`/users/${user.username}`)
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Login failed.')
    }
  }

  const handleLogout = () => {
    setCurrentUsername('')
    setShowPasswordPanel(false)
    setCurrentPassword('')
    setNextPassword('')
    setPasswordMessage('')
    clearSession()
    goToPath('/')
  }

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!currentUsername) {
      return
    }

    if (nextPassword.length < 4) {
      setPasswordMessage('Password needs at least 4 characters.')
      return
    }

    try {
      await apiRequest<{ user: UserRecord }>(
        `/api/users/${encodeURIComponent(currentUsername)}/password`,
        {
          method: 'POST',
          body: JSON.stringify({ currentPassword, nextPassword }),
        },
      )
      setCurrentPassword('')
      setNextPassword('')
      setPasswordMessage('Password changed.')
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : 'Could not change password.')
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

  const syncWallet = async () => {
    if (!activeCasinoUser || activeCasinoUser.username !== currentUsername) {
      return
    }

    setWalletMessage('Checking wallet.')

    try {
      const { credited, user } = await apiRequest<{ credited: number; user: UserRecord }>(
        `/api/users/${encodeURIComponent(activeCasinoUser.username)}/sync-wallet`,
        { method: 'POST' },
      )
      upsertUser(user)
      setWalletMessage(credited > 0 ? `Credited ${credited.toLocaleString()} coins.` : 'No new deposits.')
    } catch (error) {
      setWalletMessage(error instanceof Error ? error.message : 'Could not check wallet.')
    }
  }

  const copyWalletAddress = async (walletAddress: string) => {
    if (!walletAddress) {
      return
    }

    await navigator.clipboard.writeText(walletAddress)
    setWalletMessage('Wallet address copied.')
    window.setTimeout(() => setWalletMessage(''), 1400)
  }

  const getWithdrawalAmount = () => Math.floor(Number(withdrawAmount) || 0)

  const validateWithdrawal = () => {
    if (!activeCasinoUser || activeCasinoUser.username !== currentUsername) {
      return false
    }

    if (!withdrawAddress.trim()) {
      setWalletMessage('Withdrawal address is required.')
      return false
    }

    const amount = getWithdrawalAmount()

    if (amount <= 0) {
      setWalletMessage('Withdrawal amount must be positive.')
      return false
    }

    if (amount > activeCasinoUser.coins) {
      setWalletMessage('Insufficient balance.')
      return false
    }

    return true
  }

  const withdrawCoins = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (validateWithdrawal()) {
      setShowWithdrawConfirm(true)
    }
  }

  const confirmWithdrawCoins = async () => {
    if (!activeCasinoUser || activeCasinoUser.username !== currentUsername || !validateWithdrawal()) {
      setShowWithdrawConfirm(false)
      return
    }

    const amount = getWithdrawalAmount()
    const previousUser = activeCasinoUser
    setShowWithdrawConfirm(false)
    setWalletMessage('Sending withdrawal.')
    upsertUser({ ...activeCasinoUser, coins: activeCasinoUser.coins - amount })

    try {
      const { user, transaction } = await apiRequest<WithdrawResponse>(
        `/api/users/${encodeURIComponent(activeCasinoUser.username)}/withdraw`,
        {
          method: 'POST',
          body: JSON.stringify({ receiverAddress: withdrawAddress, amount }),
        },
      )
      upsertUser(user)
      setWithdrawAmount('')
      setWalletMessage(
        transaction.status === 'submitted'
          ? 'Withdrawal submitted to the UncCoin network.'
          : 'Withdrawal request accepted.',
      )
    } catch (error) {
      upsertUser(previousUser)
      setWalletMessage(error instanceof Error ? error.message : 'Withdrawal failed.')
    }
  }

  const deleteUserAccount = async (username: string) => {
    if (!window.confirm(`Delete ${username}? This cannot be undone.`)) {
      return
    }

    try {
      await apiRequest<{ ok: true }>(`/api/users/${encodeURIComponent(username)}`, {
        method: 'DELETE',
      })
      setUsers((storedUsers) => storedUsers.filter((user) => user.username !== username))
      setAdminCoinInputs((inputs) => {
        const nextInputs = { ...inputs }
        delete nextInputs[username]
        return nextInputs
      })

      if (routePath === `/users/${username}`) {
        goToPath('/')
      }
    } catch (error) {
      setGameResult({
        title: 'Delete rejected',
        detail: error instanceof Error ? error.message : 'Could not delete user.',
      })
    }
  }

  const adjustUserCoins = (username: string, coinDelta: number) => {
    updateCoins(username, coinDelta)
  }

  const toggleZeroBalanceUsers = useCallback(() => {
    setHideZeroBalanceUsers((isHidden) => !isHidden)
  }, [])

  useEffect(() => {
    toggleZeroBalanceUsersRef.current = toggleZeroBalanceUsers
  }, [toggleZeroBalanceUsers])

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

  const getGameHelpDescription = (game: GameName) => {
    if (game === 'slots') {
      return `Costs ${gameSettings.slotsCost} coins. Three matching reels pay ${gameSettings.slotsTriplePayout}. Two matching reels pay ${gameSettings.slotsPairPayout}.`
    }

    if (game === 'flip') {
      return `Costs ${gameSettings.flipCost} coins. Pick BD or FYI. If the coin lands on your pick, you get ${gameSettings.flipPayout}.`
    }

    if (game === 'highLow') {
      return `Costs ${gameSettings.highLowCost} coins. The shown number is in the 1-13 range. Guess if the next number will be higher or lower. Correct pays ${gameSettings.highLowPayout}.`
    }

    if (game === 'dice') {
      return `Costs ${gameSettings.diceCost} coins. Roll a six to get ${gameSettings.diceSixPayout}. Roll four or five to get ${gameSettings.diceHighPayout}.`
    }

    if (game === 'lucky') {
      return `Costs ${gameSettings.luckyCost} coins. Pick 1, 2, or 3. If the machine picks the same number, you get ${gameSettings.luckyPayout}.`
    }

    return `Costs ${gameSettings.flaxCost} coins. Scratch all 9 squares. Three equal prize numbers pays that prize.`
  }

  const renderGameHelpButton = (game: GameName) => (
    <button
      className="game-help-button"
      type="button"
      aria-label={`Show ${GAME_TITLES[game]} rules`}
      onClick={() => setActiveHelp(game)}
    >
      ?
    </button>
  )

  const renderWalletHelpButton = () => (
    <button
      className="game-help-button wallet-help-button"
      type="button"
      aria-label="Show UncCoin wallet help"
      onClick={() => setShowWalletHelp(true)}
    >
      ?
    </button>
  )

  const stopAutoplay = (game: GameName) => {
    autoplayLocks.current[game] = false
    window.clearTimeout(autoplayTimeouts.current[game])
    autoplayTimeouts.current[game] = undefined
    setAutoplayGames((games) => ({ ...games, [game]: false }))
  }

  const scheduleAutoplay = (game: GameName) => {
    window.clearTimeout(autoplayTimeouts.current[game])
    autoplayTimeouts.current[game] = window.setTimeout(() => {
      autoplayTimeouts.current[game] = undefined

      if (!autoplayLocks.current[game] || gameLocks.current[game]) {
        return
      }

      runAutoplayGame(game)
    }, 450)
  }

  const toggleAutoplay = (game: GameName) => {
    const shouldStart = !autoplayLocks.current[game]
    autoplayLocks.current[game] = shouldStart
    setAutoplayGames((games) => ({ ...games, [game]: shouldStart }))

    if (shouldStart && !gameLocks.current[game]) {
      runAutoplayGame(game)
    } else if (!shouldStart) {
      window.clearTimeout(autoplayTimeouts.current[game])
      autoplayTimeouts.current[game] = undefined
    }
  }

  const renderAutoplayButton = (game: GameName) => (
    <button
      className="game-button autoplay-button"
      type="button"
      disabled={!activeCasinoUser || activeCasinoUser.username !== currentUsername}
      aria-pressed={autoplayGames[game]}
      onClick={() => toggleAutoplay(game)}
    >
      {autoplayGames[game] ? 'Stop auto' : 'Autoplay'}
    </button>
  )

  const canPlayGame = (cost: number) => {
    const casinoUser = activeCasinoUserRef.current

    if (!casinoUser || casinoUser.username !== currentUsernameRef.current) {
      setGameResult({
        title: 'Log in first',
        detail: 'Only the owner of this user page can play games.',
      })
      return false
    }

    if (casinoUser.coins < cost) {
      setGameResult({
        title: 'Need more coins',
        detail: `This game costs ${cost.toLocaleString()} coins.`,
      })
      return false
    }

    return true
  }

  const beginGame = (game: GameName, cost: number) => {
    const casinoUser = activeCasinoUserRef.current

    if (gameLocks.current[game] || !canPlayGame(cost) || !casinoUser) {
      if (autoplayLocks.current[game]) {
        stopAutoplay(game)
      }
      return ''
    }

    gameLocks.current[game] = true
    setAnimatingGames((games) => ({ ...games, [game]: true }))
    emitFloatingDelta(game, -cost)
    setGameResult({
      title: 'Bet placed',
      detail: `-${cost} coins. Result lands in 2 seconds.`,
    })

    return casinoUser.username
  }

  const revealFlaxTicket = (ticket: FlaxSquare[]) => {
    const nextTicket = ticket.map((square) => ({ ...square, scratched: false }))
    setFlaxTicket(nextTicket)

    const revealDelay = FLAX_AUTOREVEAL_MS / Math.max(nextTicket.length, 1)

    nextTicket.forEach((square, index) => {
      window.setTimeout(() => {
        setFlaxTicket((currentTicket) => currentTicket.map((currentSquare) => (
          currentSquare.id === square.id
            ? { ...currentSquare, scratched: true }
            : currentSquare
        )))
      }, Math.round(revealDelay * (index + 1)))
    })
  }

  const finishGame = (game: GameName) => {
    gameLocks.current[game] = false
    setAnimatingGames((games) => ({ ...games, [game]: false }))

    if (autoplayLocks.current[game]) {
      scheduleAutoplay(game)
    }
  }

  const runAutoplayGame = (game: GameName) => {
    if (game === 'slots') {
      playSlots()
      return
    }

    if (game === 'flip') {
      playCoinFlip(pickRandomCoinFace())
      return
    }

    if (game === 'highLow') {
      playHighLow(pickRandomHighLowGuess())
      return
    }

    if (game === 'dice') {
      playDice()
      return
    }

    if (game === 'lucky') {
      playLucky(pickRandomLuckyNumber())
      return
    }

    buyFlaxTicket()
    window.setTimeout(() => {
      if (autoplayLocks.current.flax) {
        scratchAllFlaxSquares(true)
      }
    }, 450)
  }

  const playSlots = () => {
    const cost = gameSettings.slotsCost

    const username = beginGame('slots', cost)

    if (!username) {
      return
    }

    const buildSlotSpinSequences = (reels: string[]) => (
      reels.map((reel, reelIndex) => {
        const leadSymbols = Array.from({ length: 14 }, (_, index) => (
          SLOT_SYMBOLS[(index + reelIndex * 2) % SLOT_SYMBOLS.length]
        ))
        return [...leadSymbols, reel]
      })
    )

    apiRequest<PlayResponse>(
      `/api/users/${encodeURIComponent(username)}/play`,
      {
        method: 'POST',
        body: JSON.stringify({ game: 'slots' }),
      },
    )
      .then(({ user, game }) => {
        const reels = game.reels ?? slotReels
        const payout = game.payout

        setSlotSpinSequences(buildSlotSpinSequences(reels))
        setSlotReels(reels)
        upsertUser(user)

        window.setTimeout(() => {
          if (payout > 0) {
            emitFloatingDelta('slots', payout)
          }
          setGameResult({
            title: payout > 0 ? 'Slots paid' : 'Slots missed',
            detail: payout > 0
              ? `Spent ${game.cost}, won ${payout}. Net +${payout - game.cost}.`
              : `Spent ${game.cost}. The reels kept the coins.`,
          })
          finishGame('slots')
        }, SLOT_SPIN_DURATION_MS)
      })
      .catch((error) => {
        setGameResult({
          title: 'Slots rejected',
          detail: error instanceof Error ? error.message : 'Could not play slots.',
        })
        finishGame('slots')
      })
  }

  const playCoinFlip = (pick: string) => {
    const cost = gameSettings.flipCost

    const username = beginGame('flip', cost)

    if (!username) {
      return
    }

    window.setTimeout(async () => {
      try {
        const { user, game } = await apiRequest<PlayResponse>(
          `/api/users/${encodeURIComponent(username)}/play`,
          {
            method: 'POST',
            body: JSON.stringify({ game: 'flip', pick }),
          },
        )
        const face = game.face ?? coinFace
        const payout = game.payout
        const won = payout > 0

        setCoinFace(face)
        upsertUser(user)
        if (payout > 0) {
          emitFloatingDelta('flip', payout)
        }
        setGameResult({
          title: won ? 'Flip hit' : 'Flip missed',
          detail: `You picked ${pick}. Coin landed ${face}. Net ${won ? `+${payout - game.cost}` : `-${game.cost}`}.`,
        })
      } catch (error) {
        setGameResult({
          title: 'Flip rejected',
          detail: error instanceof Error ? error.message : 'Could not flip.',
        })
      } finally {
        finishGame('flip')
      }
    }, 2000)
  }

  const playHighLow = (guess: 'higher' | 'lower') => {
    const cost = gameSettings.highLowCost

    const username = beginGame('highLow', cost)

    if (!username) {
      return
    }

    const startCard = highLowCard

    window.setTimeout(async () => {
      try {
        const { user, game } = await apiRequest<PlayResponse>(
          `/api/users/${encodeURIComponent(username)}/play`,
          {
            method: 'POST',
            body: JSON.stringify({ game: 'highLow', guess, startCard }),
          },
        )
        const nextCard = game.nextCard ?? startCard
        const payout = game.payout
        const won = payout > 0

        upsertUser(user)
        if (payout > 0) {
          emitFloatingDelta('highLow', payout)
        }
        setGameResult({
          title: won ? 'Good read' : nextCard === startCard ? 'Push? No mercy' : 'Bad read',
          detail: `${startCard} to ${nextCard}. Spent ${game.cost}, ${won ? `won ${payout}` : 'won 0'}.`,
        })
        setHighLowCard(nextCard)
      } catch (error) {
        setGameResult({
          title: 'High low rejected',
          detail: error instanceof Error ? error.message : 'Could not play high low.',
        })
      } finally {
        finishGame('highLow')
      }
    }, 2000)
  }

  const playDice = () => {
    const cost = gameSettings.diceCost
    const username = beginGame('dice', cost)

    if (!username) {
      return
    }

    window.setTimeout(async () => {
      try {
        const { user, game } = await apiRequest<PlayResponse>(
          `/api/users/${encodeURIComponent(username)}/play`,
          {
            method: 'POST',
            body: JSON.stringify({ game: 'dice' }),
          },
        )
        const roll = game.roll ?? diceRoll
        const payout = game.payout

        setDiceRoll(roll)
        upsertUser(user)
        if (payout > 0) {
          emitFloatingDelta('dice', payout)
        }
        setGameResult({
          title: payout > 0 ? 'Dice paid' : 'Dice missed',
          detail: `Rolled ${roll}. Spent ${game.cost}, ${payout > 0 ? `won ${payout}` : 'won 0'}.`,
        })
      } catch (error) {
        setGameResult({
          title: 'Dice rejected',
          detail: error instanceof Error ? error.message : 'Could not roll dice.',
        })
      } finally {
        finishGame('dice')
      }
    }, 2000)
  }

  const playLucky = (pick: number) => {
    const cost = gameSettings.luckyCost
    const username = beginGame('lucky', cost)

    if (!username) {
      return
    }

    window.setTimeout(async () => {
      try {
        const { user, game } = await apiRequest<PlayResponse>(
          `/api/users/${encodeURIComponent(username)}/play`,
          {
            method: 'POST',
            body: JSON.stringify({ game: 'lucky', pick }),
          },
        )
        const number = game.number ?? luckyNumber
        const payout = game.payout
        const won = payout > 0

        setLuckyNumber(number)
        upsertUser(user)
        if (payout > 0) {
          emitFloatingDelta('lucky', payout)
        }
        setGameResult({
          title: won ? 'Lucky hit' : 'Lucky missed',
          detail: `You picked ${pick}. Machine picked ${number}. ${won ? `Won ${payout}` : 'Won 0'}.`,
        })
      } catch (error) {
        setGameResult({
          title: 'Lucky rejected',
          detail: error instanceof Error ? error.message : 'Could not play lucky pick.',
        })
      } finally {
        finishGame('lucky')
      }
    }, 2000)
  }

  const buyFlaxTicket = async () => {
    const cost = gameSettings.flaxCost
    const username = beginGame('flax', cost)

    if (!username) {
      return
    }

    try {
      const { user, game } = await apiRequest<PlayResponse>(
        `/api/users/${encodeURIComponent(username)}/play`,
        {
          method: 'POST',
          body: JSON.stringify({ game: 'flax' }),
        },
      )

      upsertUser(user)
      setFlaxTicket(game.ticket ?? createFlaxTicket(gameSettings))
      setGameResult({
        title: 'FLAX-lodd ready',
        detail: `Spent ${game.cost}. Scratch all 9 squares to check the prize.`,
      })
    } catch (error) {
      setGameResult({
        title: 'FLAX rejected',
        detail: error instanceof Error ? error.message : 'Could not buy FLAX-lodd.',
      })
      finishGame('flax')
    }
  }

  const scratchFlaxSquare = async (squareId: number) => {
    if (!animatingGames.flax || !activeCasinoUser || activeCasinoUser.username !== currentUsername) {
      return
    }

    try {
      const { user, game } = await apiRequest<FlaxScratchResponse>(
        `/api/users/${encodeURIComponent(activeCasinoUser.username)}/flax-scratch`,
        {
          method: 'POST',
          body: JSON.stringify({ squareId }),
        },
      )
      const paidPrize = game.paidPrize || game.payout

      upsertUser(user)
      setFlaxTicket(game.ticket)

      if (game.payout > 0) {
        emitFloatingDelta('flax', game.payout)
        setGameResult({
          title: 'FLAX paid',
          detail: `Three equal ${game.payout} prizes. Won ${game.payout}. Scratch the rest of the ticket.`,
        })
      }

      if (game.finished) {
        setGameResult({
          title: paidPrize > 0 ? 'FLAX complete' : 'No win',
          detail: paidPrize > 0
            ? `Ticket finished. Paid ${paidPrize} coins.`
            : 'No three equal prize numbers on this ticket. No win.',
        })
        finishGame('flax')
      }
    } catch (error) {
      setGameResult({
        title: 'Scratch rejected',
        detail: error instanceof Error ? error.message : 'Could not scratch FLAX-lodd.',
      })
    }
  }

  const scratchAllFlaxSquares = async (force = false) => {
    if ((!force && !animatingGames.flax) || !activeCasinoUser || activeCasinoUser.username !== currentUsername) {
      return
    }

    try {
      const { user, game } = await apiRequest<FlaxScratchResponse>(
        `/api/users/${encodeURIComponent(activeCasinoUser.username)}/flax-scratch`,
        {
          method: 'POST',
          body: JSON.stringify({ all: true }),
        },
      )
      const paidPrize = game.paidPrize || game.payout

      upsertUser(user)
      revealFlaxTicket(game.ticket)

      if (game.payout > 0) {
        emitFloatingDelta('flax', game.payout, FLAX_AUTOREVEAL_MS)
      }

      window.setTimeout(() => {
        setGameResult({
          title: paidPrize > 0 ? 'FLAX complete' : 'No win',
          detail: paidPrize > 0
            ? `Ticket finished. Paid ${paidPrize} coins.`
            : 'No three equal prize numbers on this ticket. No win.',
        })
        finishGame('flax')
      }, FLAX_AUTOREVEAL_MS)
    } catch (error) {
      setGameResult({
        title: 'Scratch rejected',
        detail: error instanceof Error ? error.message : 'Could not scratch FLAX-lodd.',
      })
    }
  }

  const copyEmail = async () => {
    await navigator.clipboard.writeText(EMAIL_ADDRESS)
    setCopyMessage('Copied')
    window.setTimeout(() => setCopyMessage(''), 1400)
  }

  const renderTopList = (variant: 'home' | 'user') => (
    <section
      className={`top-list ${variant === 'home' ? 'home-top-list' : 'user-top-list'}`}
      aria-labelledby={`${variant}-top-list-title`}
    >
      <div className="top-list-header">
        <p className="eyebrow">Top list</p>
        <h2 id={`${variant}-top-list-title`}>Coin leaders</h2>
      </div>
      {topUsers.length > 0 ? (
        <ol className="top-list-ranks">
          {topUsers.map((user, index) => (
            <li key={user.username}>
              <button type="button" onClick={() => goToPath(`/users/${user.username}`)}>
                <span>#{index + 1}</span>
                <strong>{user.username}</strong>
                <em>{user.coins.toLocaleString()} coins</em>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="top-list-empty">No users yet.</p>
      )}
    </section>
  )

  const updateGameSetting = async (setting: keyof GameSettings, value: string) => {
    const normalizedValue = normalizeSettingValue(Number(value))

    setGameSettings((settings) => ({
      ...settings,
      [setting]: normalizedValue,
    }))

    try {
      const { settings } = await apiRequest<{ settings: GameSettings }>('/api/game-settings', {
        method: 'PATCH',
        body: JSON.stringify({ [setting]: normalizedValue }),
      })
      setGameSettings(settings)
    } catch (error) {
      setGameResult({
        title: 'Settings rejected',
        detail: error instanceof Error ? error.message : 'Could not save game settings.',
      })
    }
  }

  const resetGameSettings = async () => {
    try {
      const { settings } = await apiRequest<{ settings: GameSettings }>('/api/game-settings', {
        method: 'PATCH',
        body: JSON.stringify(DEFAULT_GAME_SETTINGS),
      })
      setGameSettings(settings)
      setFlaxTicket(createFlaxTicket(settings))
    } catch (error) {
      setGameResult({
        title: 'Settings rejected',
        detail: error instanceof Error ? error.message : 'Could not reset game settings.',
      })
    }
  }

  const renderPricePanel = () => (
    <section className="price-admin-panel" aria-labelledby="price-admin-title">
      <div className="price-admin-header">
        <p className="eyebrow">Press P</p>
        <h2 id="price-admin-title">Game prices</h2>
        <button className="game-button alt" type="button" onClick={() => setShowPricePanel(false)}>
          Close
        </button>
      </div>
      <div className="price-admin-grid">
        {(Object.entries(GAME_SETTING_LABELS) as [keyof GameSettings, string][]).map(([setting, label]) => (
          <label key={setting}>
            {label}
            <input
              inputMode="numeric"
              min="0"
              type="number"
              value={gameSettings[setting]}
              onChange={(event) => updateGameSetting(setting, event.target.value)}
            />
          </label>
        ))}
      </div>
      <button className="game-button" type="button" onClick={resetGameSettings}>
        Reset defaults
      </button>
    </section>
  )

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

  const renderPasswordPanel = () => (
    <div
      className="password-overlay"
      role="presentation"
      onClick={() => setShowPasswordPanel(false)}
    >
      <form
        className="password-dialog"
        aria-labelledby="password-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handlePasswordSubmit}
      >
        <p className="eyebrow">Account</p>
        <h2 id="password-title">New password</h2>
        <label>
          Current password
          <input
            autoComplete="current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label>
          New password
          <input
            autoComplete="new-password"
            type="password"
            value={nextPassword}
            onChange={(event) => setNextPassword(event.target.value)}
          />
        </label>
        <div className="password-actions">
          <button className="game-button" type="submit">
            Save
          </button>
          <button
            className="game-button alt"
            type="button"
            onClick={() => setShowPasswordPanel(false)}
          >
            Close
          </button>
        </div>
        {passwordMessage && <p className="form-message">{passwordMessage}</p>}
      </form>
    </div>
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
    const isViewOnly = !isOwnPage

    return (
      <main className={`user-page ${isViewOnly ? 'is-view-only' : ''}`}>
        {isViewOnly && (
          <div className="view-only-eye" aria-hidden="true">
            <span></span>
          </div>
        )}
        <nav className="site-nav user-nav" aria-label="User navigation">
          <button className="brand-mark nav-button" type="button" onClick={() => goToPath('/')}>
            BD.FYI
          </button>
          <div className="nav-links">
            <button type="button" onClick={() => goToPath('/')}>
              Home
            </button>
            {!isOwnPage && currentUsername && (
              <button type="button" onClick={() => goToPath(`/users/${currentUsername}`)}>
                My page
              </button>
            )}
            {isOwnPage && (
              <button type="button" onClick={handleLogout}>
                Log out
              </button>
            )}
          </div>
        </nav>

        <section className="casino-floor" aria-labelledby="casino-title">
          <div className="casino-copy">
            <p className="eyebrow">{isViewOnly ? 'View only' : 'User casino'}</p>
            <h1 id="casino-title">{activeCasinoUser.username}</h1>
          </div>

          <div className="coin-vault">
            <span>Balance</span>
            <strong>{activeCasinoUser.coins.toLocaleString()}</strong>
            <em>coins</em>
          </div>
        </section>

        {isOwnPage && (
          <section className="wallet-panel" aria-labelledby="wallet-title">
            <div className="wallet-info">
              <p className="eyebrow">UncCoin wallet</p>
              <div className="wallet-heading">
                <h2 id="wallet-title">Deposit address</h2>
                {renderWalletHelpButton()}
              </div>
              {activeCasinoUser.walletAddress ? (
                <button
                  className="wallet-address-button"
                  type="button"
                  onClick={() => copyWalletAddress(activeCasinoUser.walletAddress)}
                >
                  {activeCasinoUser.walletAddress}
                </button>
              ) : (
                <code>Wallet pending</code>
              )}
              <button className="game-button alt" type="button" onClick={syncWallet}>
                Check deposits
              </button>
            </div>
            <form className="withdraw-form" onSubmit={withdrawCoins}>
              <label>
                Withdrawal address
                <input
                  value={withdrawAddress}
                  onChange={(event) => setWithdrawAddress(event.target.value)}
                  placeholder="UncCoin wallet address"
                />
              </label>
              <label>
                Amount
                <input
                  inputMode="numeric"
                  min="1"
                  type="number"
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                  placeholder="0"
                />
              </label>
              <button className="game-button" type="submit">
                Withdraw
              </button>
              {walletMessage && <p className="form-message">{walletMessage}</p>}
            </form>
          </section>
        )}

        {!isOwnPage && (
          <section className="wallet-panel view-wallet-panel" aria-labelledby="wallet-view-title">
            <div className="wallet-info">
              <p className="eyebrow">UncCoin wallet</p>
              <div className="wallet-heading">
                <h2 id="wallet-view-title">Deposit address</h2>
                {renderWalletHelpButton()}
              </div>
              {activeCasinoUser.walletAddress ? (
                <button
                  className="wallet-address-button"
                  type="button"
                  onClick={() => copyWalletAddress(activeCasinoUser.walletAddress)}
                >
                  {activeCasinoUser.walletAddress}
                </button>
              ) : (
                <code>Wallet pending</code>
              )}
            </div>
          </section>
        )}

        {canAdminUsers && showPricePanel && renderPricePanel()}

        {renderTopList('user')}

        {isOwnPage && (
        <section className="game-grid" aria-label="Casino games">
          <article className={`game-card slots-game ${animatingGames.slots ? 'is-playing' : ''}`}>
            {renderFloatingDeltas('slots')}
            <div className="game-balance-badge" aria-live="polite">
              <strong>{activeCasinoUser.coins.toLocaleString()} coins</strong>
            </div>
            <div className="game-heading">
              <p className="eyebrow">Cost: {gameSettings.slotsCost}</p>
              <h2>Slots</h2>
              {renderGameHelpButton('slots')}
            </div>
            <div className="game-reels" aria-label={`Slot result ${slotReels.join(' ')}`}>
              {slotReels.map((reel, index) => (
                <span className={getSlotSymbolClassName(reel)} key={`${reel}-${index}`}>
                  {animatingGames.slots ? (
                    <span
                      className="slot-strip"
                      style={{
                        '--slot-stop': `${-(slotSpinSequences[index].length - 1) * SLOT_REEL_HEIGHT}px`,
                      } as CSSProperties}
                    >
                      {slotSpinSequences[index].map((symbol, symbolIndex) => (
                        <span className={getSlotSymbolClassName(symbol)} key={`${symbol}-${symbolIndex}`}>
                          {symbol}
                        </span>
                      ))}
                    </span>
                  ) : reel}
                </span>
              ))}
            </div>
            <p>Three match pays {gameSettings.slotsTriplePayout}. Two match pays {gameSettings.slotsPairPayout}.</p>
            <button className="game-button" type="button" disabled={!isOwnPage || animatingGames.slots} onClick={playSlots}>
              {animatingGames.slots ? 'Spinning' : 'Spin'}
            </button>
            {renderAutoplayButton('slots')}
          </article>

          <article className={`game-card flip-game ${animatingGames.flip ? 'is-playing' : ''}`}>
            {renderFloatingDeltas('flip')}
            <div className="game-balance-badge" aria-live="polite">
              <strong>{activeCasinoUser.coins.toLocaleString()} coins</strong>
            </div>
            <div className="game-heading">
              <p className="eyebrow">Cost: {gameSettings.flipCost}</p>
              <h2>Coin flip</h2>
              {renderGameHelpButton('flip')}
            </div>
            <div className="coin-display">{coinFace}</div>
            <p>Pick a side. Correct pays {gameSettings.flipPayout}.</p>
            <div className="game-actions">
              <button className="game-button" type="button" disabled={!isOwnPage || animatingGames.flip} onClick={() => playCoinFlip('BD')}>
                BD
              </button>
              <button className="game-button alt" type="button" disabled={!isOwnPage || animatingGames.flip} onClick={() => playCoinFlip('FYI')}>
                FYI
              </button>
            </div>
            {renderAutoplayButton('flip')}
          </article>

          <article className={`game-card high-low-game ${animatingGames.highLow ? 'is-playing' : ''}`}>
            {renderFloatingDeltas('highLow')}
            <div className="game-balance-badge" aria-live="polite">
              <strong>{activeCasinoUser.coins.toLocaleString()} coins</strong>
            </div>
            <div className="game-heading">
              <p className="eyebrow">Cost: {gameSettings.highLowCost}</p>
              <h2>High low</h2>
              {renderGameHelpButton('highLow')}
            </div>
            <div className="card-display">{highLowCard}</div>
            <p>The shown number is 1-13. Guess the next number. Correct pays {gameSettings.highLowPayout}.</p>
            <div className="game-actions">
              <button className="game-button" type="button" disabled={!isOwnPage || animatingGames.highLow} onClick={() => playHighLow('higher')}>
                Higher
              </button>
              <button className="game-button alt" type="button" disabled={!isOwnPage || animatingGames.highLow} onClick={() => playHighLow('lower')}>
                Lower
              </button>
            </div>
            {renderAutoplayButton('highLow')}
          </article>

          <article className={`game-card dice-game ${animatingGames.dice ? 'is-playing' : ''}`}>
            {renderFloatingDeltas('dice')}
            <div className="game-balance-badge" aria-live="polite">
              <strong>{activeCasinoUser.coins.toLocaleString()} coins</strong>
            </div>
            <div className="game-heading">
              <p className="eyebrow">Cost: {gameSettings.diceCost}</p>
              <h2>Dice roll</h2>
              {renderGameHelpButton('dice')}
            </div>
            <div className="dice-display">{diceRoll}</div>
            <p>Six pays {gameSettings.diceSixPayout}. Four or five pays {gameSettings.diceHighPayout}.</p>
            <button className="game-button" type="button" disabled={!isOwnPage || animatingGames.dice} onClick={playDice}>
              {animatingGames.dice ? 'Rolling' : 'Roll'}
            </button>
            {renderAutoplayButton('dice')}
          </article>

          <article className={`game-card lucky-game ${animatingGames.lucky ? 'is-playing' : ''}`}>
            {renderFloatingDeltas('lucky')}
            <div className="game-balance-badge" aria-live="polite">
              <strong>{activeCasinoUser.coins.toLocaleString()} coins</strong>
            </div>
            <div className="game-heading">
              <p className="eyebrow">Cost: {gameSettings.luckyCost}</p>
              <h2>Lucky pick</h2>
              {renderGameHelpButton('lucky')}
            </div>
            <div className="lucky-display">{luckyNumber}</div>
            <p>Pick one number. Match the machine for {gameSettings.luckyPayout}.</p>
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
            {renderAutoplayButton('lucky')}
          </article>

          <article className={`game-card flax-game ${animatingGames.flax ? 'is-playing' : ''}`}>
            {renderFloatingDeltas('flax')}
            <div className="game-balance-badge" aria-live="polite">
              <strong>{activeCasinoUser.coins.toLocaleString()} coins</strong>
            </div>
            <div className="game-heading">
              <p className="eyebrow">Cost: {gameSettings.flaxCost}</p>
              <h2>FLAX-lodd</h2>
              {renderGameHelpButton('flax')}
            </div>
            <div className="flax-ticket" aria-label="FLAX-lodd scratch ticket">
              {flaxTicket.map((square) => (
                <button
                  className={`flax-square flax-prize-${square.prize} ${square.scratched ? 'is-scratched' : ''}`}
                  data-square-id={square.id}
                  disabled={!isOwnPage || !animatingGames.flax || square.scratched}
                  key={square.id}
                  type="button"
                  onClick={(event) => scratchFlaxSquare(Number(event.currentTarget.dataset.squareId))}
                >
                  <span>{square.scratched ? square.prize.toLocaleString() : '?'}</span>
                </button>
              ))}
            </div>
            <p>Scratch 9 squares. Three equal prize numbers wins that prize.</p>
            <div className="game-actions">
              <button
                className="game-button"
                type="button"
                disabled={!isOwnPage || animatingGames.flax}
                onClick={buyFlaxTicket}
              >
                Buy ticket
              </button>
              <button
                className="game-button alt"
                type="button"
                disabled={!isOwnPage || !animatingGames.flax}
                onClick={() => scratchAllFlaxSquares()}
              >
                Scratch all
              </button>
            </div>
            {renderAutoplayButton('flax')}
          </article>

          <aside className="game-result" aria-live="polite">
            <span>Result board</span>
            <strong>{gameResult.title}</strong>
            <p>{gameResult.detail}</p>
          </aside>
        </section>
        )}

        {activeHelp && (
          <div className="help-overlay" role="presentation" onClick={() => setActiveHelp('')}>
            <section
              className="help-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="help-title"
            >
              <p className="eyebrow">Game rules</p>
              <h2 id="help-title">{GAME_TITLES[activeHelp]}</h2>
              <p>{getGameHelpDescription(activeHelp)}</p>
            </section>
          </div>
        )}

        {showWalletHelp && (
          <div className="help-overlay" role="presentation" onClick={() => setShowWalletHelp(false)}>
            <section
              className="help-dialog wallet-help-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="wallet-help-title"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="eyebrow">UncCoin wallet</p>
              <h2 id="wallet-help-title">Deposits</h2>
              <p>
                Deposits need to be done in UncCoin from{' '}
                <a href="https://UncCoin.no" target="_blank" rel="noreferrer">
                  UncCoin.no
                </a>{' '}
                to the specified address. Coins can be withdrawn as UncCoins to any UncCoin
                wallet-address.
              </p>
            </section>
          </div>
        )}

        {showWithdrawConfirm && activeCasinoUser && (
          <div
            className="confirm-overlay"
            role="presentation"
            onClick={() => setShowWithdrawConfirm(false)}
          >
            <section
              className="confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="withdraw-confirm-title"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="eyebrow">Confirm withdrawal</p>
              <h2 id="withdraw-confirm-title">Are you sure?</h2>
              <p>
                Withdraw {getWithdrawalAmount().toLocaleString()} coins as UncCoins to{' '}
                <strong>{withdrawAddress}</strong>.
              </p>
              <div className="confirm-actions">
                <button className="game-button" type="button" onClick={confirmWithdrawCoins}>
                  Withdraw
                </button>
                <button
                  className="game-button alt"
                  type="button"
                  onClick={() => setShowWithdrawConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </section>
          </div>
        )}

        {showPasswordPanel && renderPasswordPanel()}

        {canAdminUsers && (
          <section className="admin-panel" aria-labelledby="admin-title">
            <div className="admin-header">
              <div className="admin-title-row">
                <p className="eyebrow">Niklas only</p>
                <button
                  className="admin-cleanup-button"
                  type="button"
                  aria-pressed={hideZeroBalanceUsers}
                  onClick={toggleZeroBalanceUsers}
                >
                  {hideZeroBalanceUsers ? 'Show 0-coin users' : 'Hide 0-coin users'}
                </button>
              </div>
              <h2 id="admin-title">Admin panel</h2>
            </div>

            <div className="admin-users">
              {users
                .filter((user) => !hideZeroBalanceUsers || user.coins > 0)
                .map((user) => {
                const inputValue = adminCoinInputs[user.username] ?? String(user.coins)

                return (
                  <article className="admin-user" key={user.username}>
                    <div>
                      <strong>{user.username}</strong>
                      <span>{user.coins.toLocaleString()} coins</span>
                      <code>{user.walletAddress || 'No wallet'}</code>
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
                      <button
                        className="danger"
                        type="button"
                        disabled={user.username === 'niklas'}
                        onClick={() => deleteUserAccount(user.username)}
                      >
                        Delete
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
            <h1 className="hero-title">bigdick.fyi</h1>
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

      {currentUsername === 'niklas' && showPricePanel && renderPricePanel()}

      {renderTopList('home')}

      {!currentUser && renderAuthPanel()}

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

      {showPasswordPanel && renderPasswordPanel()}

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
