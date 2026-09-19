import { Avatar } from '@renderer/components/ui/avatar'

export interface PersonHeroProps {
  name: string
  born: string
  profile: string | undefined
  backdrops: string[]
}

export function PersonHero({ name, born, profile, backdrops }: PersonHeroProps): React.JSX.Element {
  return (
    <section
      className="relative h-[280px] w-full shrink-0 overflow-hidden rounded-lg bg-surface"
      aria-label={name}
    >
      <CollageBackdrop tiles={backdrops} />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(18,18,18,0.35) 0%, rgba(18,18,18,0.55) 45%, rgba(18,18,18,0.9) 85%, #121212 100%)'
        }}
      />
      <div className="relative flex h-full items-end gap-6 p-8">
        <Avatar
          src={profile}
          alt={name}
          seed={name}
          shape="circle"
          className="size-[180px] rounded-full"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pb-1">
          <h1 className="text-[34px] leading-[1.1] font-bold tracking-[-0.02em] text-balance text-text">
            {name}
          </h1>
          {born ? (
            <span className="text-[13px] leading-4 font-medium text-text-secondary">{born}</span>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function CollageBackdrop({ tiles }: { tiles: string[] }): React.JSX.Element {
  if (tiles.length === 0) {
    return <div className="absolute inset-0 bg-surface-2" />
  }
  return (
    <div
      className="absolute top-0 bottom-0 flex"
      style={{ left: '-12%', right: '-12%', transform: 'skewX(-12deg)' }}
    >
      {tiles.map((src, i) => (
        <div
          key={`${i}-${src}`}
          className="h-full flex-1 bg-cover bg-center"
          style={{
            backgroundImage: `url(${src})`,
            transform: 'skewX(12deg)',
            transformOrigin: 'center'
          }}
        />
      ))}
    </div>
  )
}
