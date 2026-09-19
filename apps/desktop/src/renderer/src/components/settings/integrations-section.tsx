import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Switch } from '@renderer/components/ui/switch'
import { DiscordIcon } from '@renderer/components/icons'
import { readDiscordRpcEnabled, writeDiscordRpcEnabled } from '@renderer/lib/discord-prefs'
import { api } from '@convex/_generated/api'
import traktLogo from '@renderer/assets/brand/trakt.webp'
import { Row } from '@renderer/components/settings/integration-row'
import { ImdbIntegration } from '@renderer/components/settings/imdb-integration'

export function IntegrationsSection(): React.JSX.Element {
  const [discordRpc, setDiscordRpc] = useState(() => readDiscordRpcEnabled())

  return (
    <div className="flex flex-col gap-2">
      <Row
        icon={<DiscordIcon className="size-6" />}
        title="Discord Rich Presence"
        description="Show what you're watching on your Discord profile."
        trailing={
          <Switch
            checked={discordRpc}
            onCheckedChange={(v) => {
              setDiscordRpc(v)
              writeDiscordRpcEnabled(v)
            }}
          />
        }
      />
      <TraktIntegration />
      <ImdbIntegration />
    </div>
  )
}

function TraktIntegration(): React.JSX.Element {
  const connection = useQuery(api.trakt.connection)
  const startConnect = useMutation(api.trakt.startConnect)
  const setPrefs = useMutation(api.trakt.setSyncPrefs)
  const disconnect = useMutation(api.trakt.disconnect)

  const onConnect = async (): Promise<void> => {
    const { url } = await startConnect()
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const traktIcon = (
    <img src={traktLogo} alt="" className="size-[26px] rounded-[7px] object-cover" />
  )

  if (!connection) {
    return (
      <Row
        icon={traktIcon}
        title="Trakt"
        description="Sync watched history & ratings with your Trakt profile."
        trailing={
          <button
            type="button"
            onClick={() => void onConnect()}
            className="flex h-[30px] shrink-0 items-center justify-center rounded-[10px] bg-white px-4 text-[12px] font-semibold text-black outline-none transition-opacity active:opacity-80"
          >
            Connect
          </button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col">
      <Row
        icon={traktIcon}
        title="Trakt"
        description={
          <span className="flex items-center gap-1.5">
            {connection.avatarUrl ? (
              <img
                src={connection.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="size-[15px] shrink-0 rounded-full object-cover ring-1 ring-white/15"
              />
            ) : null}
            <span className="truncate">
              Connected as{' '}
              <button
                type="button"
                onClick={() =>
                  window.open(
                    `https://trakt.tv/users/${connection.username}`,
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
                className="font-semibold text-text outline-none transition-opacity active:opacity-80"
              >
                @{connection.username}
              </button>
            </span>
          </span>
        }
        trailing={
          <button
            type="button"
            onClick={() => void disconnect()}
            className="flex h-[30px] shrink-0 items-center justify-center rounded-[10px] bg-white/[0.06] px-3.5 text-[12px] font-medium text-text outline-none transition-opacity active:opacity-80"
          >
            Disconnect
          </button>
        }
      />
      <div className="flex flex-col bg-white/[0.015]">
        <SubToggle
          title="Sync watch history"
          description="Marks what you finish as watched on Trakt and brings your Trakt history into Vesper."
          checked={connection.syncWatched}
          onChange={(v) => void setPrefs({ syncWatched: v })}
        />
        <SubToggle
          title="Sync ratings"
          description="Keeps the titles you rate matched up between Vesper and Trakt."
          checked={connection.syncRatings}
          onChange={(v) => void setPrefs({ syncRatings: v })}
        />
      </div>
    </div>
  )
}

function SubToggle({
  title,
  description,
  checked,
  onChange
}: {
  title: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] py-3 pr-1 pl-[46px] last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] leading-4 font-medium text-text">{title}</span>
        <span className="truncate text-[12px] leading-4 font-medium text-text-muted">
          {description}
        </span>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
