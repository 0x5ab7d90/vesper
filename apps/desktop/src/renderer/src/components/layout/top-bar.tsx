import { useEffect, useState } from 'react'
import { IconButton } from '@renderer/components/ui/icon-button'
import { SearchControl } from '@renderer/components/search/search-popover'
import { UserMenu } from '@renderer/components/layout/user-menu'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  HomeIcon,
  PeopleGroupIcon,
  SidebarLeftIcon,
  WinCloseIcon,
  WinMaximizeIcon,
  WinMinimizeIcon
} from '@renderer/components/icons'
import { useNavigate } from '@tanstack/react-router'
import { isMac, isWindows } from '@renderer/lib/platform'
import { useNavState } from '@renderer/lib/use-nav-state'

const BUTTON = 32 // IconButton size="md"
const GAP = 8 // nav gap-2
const MAC_TRAFFIC_LIGHTS = 78
const NAV_MARGIN = isWindows ? 16 : 24 // ml-4 / ml-6
const RIGHT_PAD = 10 // pr-2.5
const SEARCH_MAX = 560
const SEARCH_GUTTER = 16 // minimum breathing room between the search bar and its neighbours
const WIN_CONTROLS_WIDTH = 114 // 3 buttons × 32 + 2 gaps × 4 + pr-2.5

export interface TopBarProps {
  leftCollapsed: boolean
  rightCollapsed: boolean
  onExpandLeft: () => void
  onExpandRight: () => void
  minimal?: boolean
}

export function TopBar({
  leftCollapsed,
  rightCollapsed,
  onExpandLeft,
  onExpandRight,
  minimal = false
}: TopBarProps): React.JSX.Element {
  const [winWidth, setWinWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = (): void => setWinWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // The search bar is centred on the whole window, independent of the side panes. It only
  // moves when the window itself is too narrow to keep it clear of the nav cluster on the left
  // or the account/window controls on the right.
  const navButtons = 3 + (leftCollapsed ? 1 : 0)
  const navEnd =
    (isMac ? MAC_TRAFFIC_LIGHTS : 0) + NAV_MARGIN + navButtons * BUTTON + (navButtons - 1) * GAP
  const rightStart =
    winWidth -
    (isWindows ? WIN_CONTROLS_WIDTH : 0) -
    RIGHT_PAD -
    BUTTON -
    (rightCollapsed ? BUTTON + GAP : 0)
  const available = rightStart - navEnd - 2 * SEARCH_GUTTER
  const searchWidth = Math.max(0, Math.min(SEARCH_MAX, available))
  const idealLeft = (winWidth - searchWidth) / 2
  const minLeft = navEnd + SEARCH_GUTTER
  const maxLeft = rightStart - SEARCH_GUTTER - searchWidth
  const searchLeft = Math.max(minLeft, Math.min(idealLeft, maxLeft))
  const navigate = useNavigate()
  const nav = useNavState()

  // A drag region hands its mouse events to the window manager, so a press there never reaches
  // the page and an open popover never sees the outside press that should dismiss it. While a
  // menu in this bar is open we give the drag up, which costs dragging the window by the title
  // bar for as long as the menu is open and buys back clicking anywhere to close it.
  const [searchOpen, setSearchOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const dragClass = searchOpen || userMenuOpen ? 'app-no-drag' : 'app-drag'

  if (minimal) {
    return (
      <header className="app-drag relative flex h-14 shrink-0 items-center bg-bg">
        {isMac ? <div className="w-[78px] shrink-0" aria-hidden /> : null}
        <div className="ml-auto" />
        {isWindows ? <WindowsControls /> : null}
      </header>
    )
  }

  return (
    <header className={`${dragClass} relative flex h-14 shrink-0 items-center bg-bg`}>
      {isMac ? <div className="w-[78px] shrink-0" aria-hidden /> : null}

      <nav className={`app-no-drag flex items-center gap-2 ${isWindows ? 'ml-4' : 'ml-6'}`}>
        <IconButton
          variant="ink"
          size="md"
          aria-label="Back"
          disabled={!nav.canGoBack}
          onClick={nav.back}
        >
          <ChevronLeftIcon className="size-4" />
        </IconButton>
        <IconButton
          variant="ink"
          size="md"
          aria-label="Forward"
          disabled={!nav.canGoForward}
          onClick={nav.forward}
        >
          <ChevronRightIcon className="size-4" />
        </IconButton>
        <IconButton variant="ink" size="md" aria-label="Home" onClick={() => navigate({ to: '/' })}>
          <HomeIcon className="size-[18px]" />
        </IconButton>
        {leftCollapsed ? (
          <IconButton variant="ink" size="md" aria-label="Show library" onClick={onExpandLeft}>
            <SidebarLeftIcon className="size-[18px]" />
          </IconButton>
        ) : null}
      </nav>

      <div
        className="app-no-drag absolute top-0 bottom-0 left-0 flex items-center pt-[5.2px]"
        style={{ width: searchWidth, transform: `translateX(${searchLeft}px)` }}
      >
        <SearchControl onOpenChange={setSearchOpen} />
      </div>

      <div className="app-no-drag ml-auto flex shrink-0 items-center gap-2 pr-2.5">
        {rightCollapsed ? (
          <IconButton
            variant="ghost"
            size="md"
            aria-label="Show friend activity"
            onClick={onExpandRight}
          >
            <PeopleGroupIcon className="size-5" />
          </IconButton>
        ) : null}
        <UserMenu onOpenChange={setUserMenuOpen} />
      </div>

      {isWindows ? <WindowsControls /> : null}
    </header>
  )
}

const WIN_CONTROL =
  'flex size-8 shrink-0 items-center justify-center rounded-full bg-transparent text-text-tertiary outline-none transition-colors duration-150 ease-out active:opacity-70'

function WindowsControls(): React.JSX.Element {
  return (
    <div className="app-no-drag flex shrink-0 items-center gap-1 pr-2.5">
      <button
        type="button"
        aria-label="Minimize"
        onClick={() => window.api.window.minimize()}
        className={`${WIN_CONTROL} hover:bg-white/[0.08] hover:text-text`}
      >
        <WinMinimizeIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Maximize"
        onClick={() => window.api.window.toggleMaximize()}
        className={`${WIN_CONTROL} hover:bg-white/[0.08] hover:text-text`}
      >
        <WinMaximizeIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Close"
        onClick={() => window.api.window.close()}
        className={`${WIN_CONTROL} hover:bg-[#e81123] hover:text-white`}
      >
        <WinCloseIcon className="size-4" />
      </button>
    </div>
  )
}
