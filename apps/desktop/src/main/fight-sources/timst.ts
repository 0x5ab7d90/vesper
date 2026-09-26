import { getText, type FightSite, type FightSiteStream } from './types'

// TimStreams serves plain JSON per event, and its event slugs are the ids
// streamed.st lists under its "foxtrot" source, so no title matching is
// needed. Its embeds are the same ones streamed.st wraps, reached without
// embed.st in between: a second path to the stream when that one is down.

const SITE = 'https://timst.cfd'

interface WatchReply {
  item?: { streams?: Array<{ name?: string; url?: string; vip?: boolean }> }
}

export const timst: FightSite = {
  name: 'TimStreams',
  async listStreams(input) {
    const ids = input.sources.filter((s) => s.source === 'foxtrot').map((s) => s.id)
    const out: FightSiteStream[] = []
    for (const id of ids) {
      let reply: WatchReply
      try {
        reply = JSON.parse(
          await getText(`${SITE}/api/watch/${encodeURIComponent(id)}`)
        ) as WatchReply
      } catch {
        continue
      }
      ;(reply.item?.streams ?? []).forEach((s, i) => {
        if (s.vip || !s.url?.startsWith('https://')) return
        out.push({
          id: `timst:${id}:${i}`,
          site: 'TimStreams',
          label: s.name || `Stream ${i + 1}`,
          hd: true,
          english: true,
          embedUrl: s.url,
          referer: `${SITE}/`
        })
      })
    }
    return out
  }
}
