import { DropMascot } from '@renderer/components/brand/drop-mascot'
import { TopBar } from '@renderer/components/layout/top-bar'

interface Props {
  children: React.ReactNode
}

export function AuthSplitLayout({ children }: Props): React.JSX.Element {
  return (
    <div className="flex h-full flex-col bg-bg">
      <TopBar
        leftCollapsed={false}
        rightCollapsed={false}
        onExpandLeft={() => undefined}
        onExpandRight={() => undefined}
        minimal
      />
      <div className="flex min-h-0 flex-1 px-2 pb-2">
        <main className="flex h-full w-full min-w-0 items-center justify-center overflow-hidden rounded-lg bg-surface">
          <div className="flex w-full max-w-[400px] flex-col gap-6 px-8">
            <DropMascot mood="idle" size={64} />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
