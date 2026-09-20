import { Button as BaseButton } from '@base-ui/react/button'
import { Avatar } from '@renderer/components/ui/avatar'
import { openPerson } from '@renderer/lib/person-modal'
import { tmdbImage } from '@renderer/lib/tmdb'

export interface CastCardProps {
  personId: number
  name: string
  character: string
  profilePath: string | null
}

export function CastCard({
  personId,
  name,
  character,
  profilePath
}: CastCardProps): React.JSX.Element {
  return (
    <BaseButton
      onClick={() => openPerson(personId)}
      className="flex w-[100px] shrink-0 flex-col items-center gap-2 bg-transparent text-center outline-none"
      aria-label={name}
    >
      <Avatar
        size="3xl"
        shape="circle"
        src={tmdbImage(profilePath, 'w185')}
        alt={name}
        seed={name}
      />
      <div className="flex flex-col gap-0.5">
        <span className="line-clamp-1 text-[13px] leading-4 font-medium text-text">{name}</span>
        <span className="line-clamp-1 text-[12px] leading-4 font-medium text-text-tertiary">
          {character}
        </span>
      </div>
    </BaseButton>
  )
}
