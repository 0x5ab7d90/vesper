import { cn } from '@renderer/lib/cn'

interface Props {
  visible: boolean
  onExit: () => void
  onMinimize: () => void
}

/**
 * Covers the player canvas while picture-in-picture is up. The canvas has to keep rendering — it
 * is the source the PiP window mirrors — so the video is hidden rather than stopped, the way a
 * browser blanks a <video> that has been handed to PiP.
 *
 * The player hides the window chrome, so this is also the only place to get the now-redundant main
 * window out of the way — handing playback to PiP is exactly when someone wants it gone.
 */
export function PipPlaceholder({ visible, onExit, onMinimize }: Props): React.JSX.Element {
  return (
    <div
      className={cn(
        'absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black transition-opacity duration-200',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      )}
      aria-hidden={!visible}
    >
      <PipGlyph />
      <p className="text-[15px] leading-5 font-semibold text-white/70">
        Playing in picture-in-picture
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onExit}
          tabIndex={visible ? 0 : -1}
          className="rounded-lg bg-white/10 px-4 py-2 text-[13px] leading-4 font-semibold text-white outline-none hover:bg-white/20"
        >
          Play here instead
        </button>
        <button
          type="button"
          onClick={onMinimize}
          tabIndex={visible ? 0 : -1}
          className="rounded-lg bg-white/10 px-4 py-2 text-[13px] leading-4 font-semibold text-white outline-none hover:bg-white/20"
        >
          Minimize Vesper
        </button>
      </div>
    </div>
  )
}

function PipGlyph(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="40"
      height="40"
      fill="currentColor"
      className="text-white/25"
      aria-hidden
    >
      <path d="M3.5 6.75C3.5 6.05 4.05 5.5 4.75 5.5H17.25C17.94 5.5 18.5 6.05 18.5 6.75V11.25C18.5 11.66 18.83 12 19.25 12C19.66 12 20 11.66 20 11.25V6.75C20 5.23 18.76 4 17.25 4H4.75C3.23 4 2 5.23 2 6.75V15.25C2 16.76 3.23 18 4.75 18H9.25C9.66 18 10 17.66 10 17.25C10 16.83 9.66 16.5 9.25 16.5H4.75C4.05 16.5 3.5 15.94 3.5 15.25V6.75Z" />
      <path d="M14.25 14C13.00 14 12 15.00 12 16.25V18.75C12 19.99 13.00 21 14.25 21H19.75C20.99 21 22 19.99 22 18.75V16.25C22 15.00 20.99 14 19.75 14H14.25Z" />
    </svg>
  )
}
