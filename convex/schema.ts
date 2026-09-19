import { authTables } from '@convex-dev/auth/server'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const mediaTypeValidator = v.union(v.literal('movie'), v.literal('tv'))

export const showcaseItemValidator = v.object({
  tmdbId: v.number(),
  mediaType: mediaTypeValidator,
  title: v.string(),
  posterPath: v.optional(v.string())
})

export const imdbUnmatchedValidator = v.object({
  title: v.string(),
  year: v.optional(v.number()),
  // IMDb's own type id ("tvEpisode", "videoGame", ...) or "no-match" when TMDB had nothing.
  reason: v.string()
})

export const imdbTallyValidator = v.object({
  ratings: v.number(),
  watchlist: v.number(),
  // Items written into custom lists, across all of them.
  lists: v.optional(v.number()),
  unmatched: v.array(imdbUnmatchedValidator),
  finishedAt: v.optional(v.number())
})

// A public IMDb list (`ls…`) the user wants imported, and the Vesper list it feeds.
export const imdbListValidator = v.object({
  imdbListId: v.string(),
  name: v.string(),
  listId: v.optional(v.id('lists')),
  // True when the list's name says its titles were watched ("Movies I've seen").
  markWatched: v.boolean(),
  total: v.optional(v.number())
})

export default defineSchema({
  ...authTables,
  profiles: defineTable({
    userId: v.id('users'),
    displayName: v.string(),
    username: v.string(),
    avatarUrl: v.optional(v.string()),
    bannerUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
    roles: v.optional(v.array(v.string())),
    visibility: v.optional(v.union(v.literal('public'), v.literal('friends'), v.literal('hidden'))),
    hidePresence: v.optional(v.boolean()),
    hideActivity: v.optional(v.boolean()),
    defaultListVisibility: v.optional(v.union(v.literal('private'), v.literal('public'))),
    // Four hand-picked titles shown on the profile card, in slot order; null keeps a gap.
    showcase: v.optional(v.array(v.union(v.null(), showcaseItemValidator))),
    // Badges granted by hand ("dev"). Earned badges are worked out from the profile instead.
    badges: v.optional(v.array(v.string())),
    createdAt: v.number()
  })
    .index('by_userId', ['userId'])
    .index('by_username', ['username'])
    .searchIndex('search_username', { searchField: 'username' })
    .searchIndex('search_displayName', { searchField: 'displayName' }),

  searchHistory: defineTable({
    userId: v.id('users'),
    kind: v.union(v.literal('movie'), v.literal('tv'), v.literal('person'), v.literal('user')),
    tmdbId: v.optional(v.number()),
    username: v.optional(v.string()),
    title: v.string(),
    subtitle: v.optional(v.string()),
    posterPath: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    queriedAt: v.number()
  }).index('by_userId_and_queriedAt', ['userId', 'queriedAt']),

  lists: defineTable({
    userId: v.id('users'),
    name: v.string(),
    description: v.optional(v.string()),
    kind: v.union(v.literal('liked'), v.literal('watched'), v.literal('custom')),
    visibility: v.union(v.literal('private'), v.literal('public')),
    coverStyle: v.optional(v.string()),
    coverUrl: v.optional(v.string()),
    coverKey: v.optional(v.string()),
    locked: v.boolean(),
    itemCount: v.number(),
    // Deprecated (link sharing removed); kept until clearShareCodes has run
    // in production, then both fields can be dropped.
    shortCode: v.optional(v.string()),
    joinCode: v.optional(v.string()),
    lastItemAddedAt: v.optional(v.number()),
    createdAt: v.number()
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_kind', ['userId', 'kind']),

  listPins: defineTable({
    userId: v.id('users'),
    listId: v.id('lists'),
    pinnedAt: v.number()
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_listId', ['userId', 'listId']),

  listOrder: defineTable({
    userId: v.id('users'),
    listId: v.id('lists'),
    rank: v.number()
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_listId', ['userId', 'listId']),

  listItems: defineTable({
    listId: v.id('lists'),
    mediaType: mediaTypeValidator,
    tmdbId: v.number(),
    addedBy: v.id('users'),
    addedAt: v.number(),
    posterPath: v.optional(v.string()),
    title: v.string()
  })
    .index('by_listId', ['listId'])
    .index('by_listId_and_addedAt', ['listId', 'addedAt'])
    .index('by_listId_and_media', ['listId', 'mediaType', 'tmdbId'])
    .index('by_user_and_media', ['addedBy', 'mediaType', 'tmdbId'])
    .searchIndex('search_title', { searchField: 'title', filterFields: ['listId'] }),

  ratings: defineTable({
    userId: v.id('users'),
    mediaType: mediaTypeValidator,
    tmdbId: v.number(),
    score: v.number(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index('by_userId', ['userId'])
    .index('by_user_and_media', ['userId', 'mediaType', 'tmdbId']),

  friendships: defineTable({
    userIdA: v.id('users'),
    userIdB: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('blocked')),
    requestedBy: v.id('users'),
    createdAt: v.number(),
    acceptedAt: v.optional(v.number())
  })
    .index('by_userIdA_and_userIdB', ['userIdA', 'userIdB'])
    .index('by_userIdA_and_status', ['userIdA', 'status'])
    .index('by_userIdB_and_status', ['userIdB', 'status']),

  playbackProgress: defineTable({
    userId: v.id('users'),
    imdbId: v.string(),
    mediaType: mediaTypeValidator,
    season: v.optional(v.number()),
    episode: v.optional(v.number()),
    positionSec: v.number(),
    durationSec: v.number(),
    state: v.optional(v.union(v.literal('playing'), v.literal('paused'), v.literal('idle'))),
    title: v.optional(v.string()),
    tmdbId: v.optional(v.number()),
    posterPath: v.optional(v.string()),
    backdropPath: v.optional(v.string()),
    streamUrl: v.optional(v.string()),
    episodeLabel: v.optional(v.string()),
    updatedAt: v.number()
  })
    .index('by_userId_and_updatedAt', ['userId', 'updatedAt'])
    .index('by_userId_and_imdb_season_ep', ['userId', 'imdbId', 'season', 'episode']),

  traktAccounts: defineTable({
    userId: v.id('users'),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    scope: v.optional(v.string()),
    traktUsername: v.string(),
    avatarUrl: v.optional(v.string()),
    syncWatched: v.boolean(),
    syncRatings: v.boolean(),
    lastSyncedAt: v.optional(v.number()),
    createdAt: v.number()
  }).index('by_userId', ['userId']),

  // One IMDb Import per user: the pasted profile link, the ur id it resolved to, and the
  // state of the current or most recent run. Imports are one-way and user-triggered.
  imdbAccounts: defineTable({
    userId: v.id('users'),
    link: v.string(),
    imdbUserId: v.optional(v.string()),
    nickName: v.optional(v.string()),
    watchlistListId: v.optional(v.id('lists')),
    status: v.union(v.literal('running'), v.literal('done'), v.literal('failed')),
    // Each run gets a fresh id; a page action whose id no longer matches stops quietly.
    runId: v.string(),
    progress: v.optional(v.object({ done: v.number(), total: v.number() })),
    error: v.optional(
      v.union(
        v.literal('not-found'),
        v.literal('private'),
        v.literal('unavailable'),
        v.literal('failed')
      )
    ),
    lists: v.optional(v.array(imdbListValidator)),
    // How the user's public lists were found: read off their lists page in-app, none there,
    // or the page was blocked and the user has to paste list links.
    listsDiscovery: v.optional(
      v.union(v.literal('found'), v.literal('none'), v.literal('blocked'))
    ),
    // Running tally for the current run, promoted to lastRun when it finishes.
    tally: v.optional(imdbTallyValidator),
    lastRun: v.optional(imdbTallyValidator),
    createdAt: v.number()
  }).index('by_userId', ['userId']),

  traktOauthState: defineTable({
    state: v.string(),
    userId: v.id('users'),
    createdAt: v.number()
  }).index('by_state', ['state']),

  presenceMonitor: defineTable({
    userId: v.string(),
    online: v.boolean(),
    lastOfflineAt: v.number()
  })
    .index('by_userId', ['userId'])
    .index('by_online', ['online']),

  // TMDB facts about a title, cached so profile stats do not refetch the same movie for
  // every user who watched it. A row with fetchedAt and no year is a title TMDB no longer
  // knows; it is kept so the job stops asking.
  titleMeta: defineTable({
    mediaType: mediaTypeValidator,
    tmdbId: v.number(),
    genres: v.array(v.string()),
    runtimeMin: v.optional(v.number()),
    year: v.optional(v.number()),
    originalLanguage: v.optional(v.string()),
    voteAverage: v.optional(v.number()),
    episodes: v.optional(v.number()),
    fetchedAt: v.number()
  }).index('by_media', ['mediaType', 'tmdbId']),

  // A user's computed watch stats, refreshed on demand when someone opens their Stats tab.
  profileStats: defineTable({
    userId: v.id('users'),
    computedAt: v.optional(v.number()),
    computingAt: v.optional(v.number()),
    itemCount: v.number(),
    stats: v.optional(v.any())
  }).index('by_userId', ['userId']),

  omdbRatings: defineTable({
    imdbId: v.string(),
    imdb: v.optional(v.number()),
    imdbVotes: v.optional(v.number()),
    metacritic: v.optional(v.number()),
    fetchedAt: v.number()
  }).index('by_imdbId', ['imdbId']),

  seriesgraphRatings: defineTable({
    tmdbId: v.number(),
    seasons: v.array(
      v.object({
        season: v.number(),
        episodes: v.array(
          v.object({
            episode: v.number(),
            name: v.optional(v.string()),
            rating: v.optional(v.number()),
            votes: v.optional(v.number()),
            airDate: v.optional(v.string())
          })
        )
      })
    ),
    fetchedAt: v.number()
  }).index('by_tmdbId', ['tmdbId'])
})
