import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { internal } from './_generated/api'
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx
} from './_generated/server'
import type { Id } from './_generated/dataModel'
import { showcaseItemValidator } from './schema'

async function areFriends(ctx: QueryCtx, a: Id<'users'>, b: Id<'users'>): Promise<boolean> {
  const { userIdA, userIdB } = a < b ? { userIdA: a, userIdB: b } : { userIdA: b, userIdB: a }
  const row = await ctx.db
    .query('friendships')
    .withIndex('by_userIdA_and_userIdB', (q) => q.eq('userIdA', userIdA).eq('userIdB', userIdB))
    .unique()
  return !!row && row.status === 'accepted'
}

const DISPLAY_NAME_MAX = 40
const BIO_MAX = 180
const USERNAME_RE = /^[a-z0-9_]{3,24}$/
const AVATAR_PREFIX = 'avatars/'
const BANNER_PREFIX = 'banners/'

async function requireProfile(ctx: MutationCtx): Promise<Doc<'profiles'>> {
  const userId = await getAuthUserId(ctx)
  if (userId === null) throw new Error('Not authenticated')
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique()
  if (!profile) throw new Error('Profile not found')
  return profile
}

function extractKey(url: string | undefined): string | null {
  if (!url) return null
  const base = process.env.R2_PUBLIC_URL
  if (!base) return null
  if (!url.startsWith(`${base}/`)) return null
  return url.slice(base.length + 1)
}

function assertOwnedKey(key: string, prefix: string, userId: string): void {
  const expected = `${prefix}${userId}/`
  if (!key.startsWith(expected)) throw new Error('Key not owned by user')
}

function publicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL
  if (!base) throw new Error('R2_PUBLIC_URL not configured')
  return `${base}/${key}`
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null
    const user = await ctx.db.get(userId)
    if (user === null) return null
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    return { user, profile }
  }
})

export const byUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    return await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
  }
})

export const publicProfileByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) return null

    const visibility = profile.visibility ?? 'public'
    if (visibility === 'hidden') return null
    if (visibility === 'friends') {
      const me = await getAuthUserId(ctx)
      const isSelf = me !== null && me === profile.userId
      if (!isSelf) {
        if (me === null) return null
        const friend = await areFriends(ctx, me, profile.userId)
        if (!friend) return null
      }
    }

    const allLists = await ctx.db
      .query('lists')
      .withIndex('by_userId', (q) => q.eq('userId', profile.userId))
      .collect()
    const publicLists = allLists.filter((l) => l.visibility === 'public')

    const listsEnriched = await Promise.all(
      publicLists.map(async (l) => {
        const items = await ctx.db
          .query('listItems')
          .withIndex('by_listId_and_addedAt', (q) => q.eq('listId', l._id))
          .order('desc')
          .take(4)
        return {
          name: l.name,
          kind: l.kind,
          itemCount: l.itemCount,
          lastItemAddedAt: l.lastItemAddedAt ?? l.createdAt,
          previewPosters: items.map((i) => i.posterPath).filter((p): p is string => !!p)
        }
      })
    )
    listsEnriched.sort((a, b) => b.lastItemAddedAt - a.lastItemAddedAt)

    const friendsA = await ctx.db
      .query('friendships')
      .withIndex('by_userIdA_and_status', (q) =>
        q.eq('userIdA', profile.userId).eq('status', 'accepted')
      )
      .collect()
    const friendsB = await ctx.db
      .query('friendships')
      .withIndex('by_userIdB_and_status', (q) =>
        q.eq('userIdB', profile.userId).eq('status', 'accepted')
      )
      .collect()
    const friendCount = friendsA.length + friendsB.length

    return {
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      bannerUrl: profile.bannerUrl,
      createdAt: profile.createdAt,
      listCount: publicLists.length,
      friendCount,
      publicLists: listsEnriched
    }
  }
})

export const ensure = mutation({
  args: { displayName: v.string(), username: v.string() },
  handler: async (ctx, { displayName, username }) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not authenticated')
    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (existing) return existing._id
    const usernameTaken = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (usernameTaken) throw new Error('Username already taken')
    return await ctx.db.insert('profiles', {
      userId,
      displayName,
      username,
      createdAt: Date.now()
    })
  }
})

export const listAdmins = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query('profiles').collect()
    return all
      .filter((p) => (p.roles ?? []).includes('admin'))
      .map((p) => ({
        userId: p.userId,
        username: p.username,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl
      }))
  }
})

export const grantAdmin = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) throw new Error(`Profile @${username} not found`)
    const roles = new Set(profile.roles ?? [])
    roles.add('admin')
    await ctx.db.patch(profile._id, { roles: Array.from(roles) })
  }
})

export const revokeAdmin = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) throw new Error(`Profile @${username} not found`)
    const roles = (profile.roles ?? []).filter((r) => r !== 'admin')
    await ctx.db.patch(profile._id, { roles })
  }
})

export const migrateR2HostsToCdn = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query('profiles').collect()
    let avatar = 0
    let banner = 0
    for (const p of all) {
      const patch: { avatarUrl?: string; bannerUrl?: string } = {}
      if (p.avatarUrl?.startsWith('https://vespr.dev/')) {
        patch.avatarUrl = p.avatarUrl.replace('https://vespr.dev/', 'https://cdn.vespr.dev/')
        avatar++
      }
      if (p.bannerUrl?.startsWith('https://vespr.dev/')) {
        patch.bannerUrl = p.bannerUrl.replace('https://vespr.dev/', 'https://cdn.vespr.dev/')
        banner++
      }
      if (patch.avatarUrl || patch.bannerUrl) await ctx.db.patch(p._id, patch)
    }
    return { avatar, banner }
  }
})

export const ensureForUser = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId)
    if (!user) return
    const avatarUrl = user.image ?? undefined
    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (existing) {
      if (existing.avatarUrl !== avatarUrl) {
        await ctx.db.patch(existing._id, { avatarUrl })
      }
      return
    }
    const seed = user.email ?? user.name ?? 'user'
    const base = slugify(seed)
    const username = await uniqueUsername(ctx, base)
    const displayName = user.name ?? deriveDisplayName(user.email) ?? 'User'
    await ctx.db.insert('profiles', {
      userId,
      displayName,
      username,
      avatarUrl,
      createdAt: Date.now()
    })
  }
})

function slugify(input: string): string {
  const local = input.includes('@') ? input.split('@')[0]! : input
  const cleaned = local.toLowerCase().replace(/[^a-z0-9]/g, '')
  return cleaned.slice(0, 24) || 'user'
}

function deriveDisplayName(email: string | undefined): string | undefined {
  if (!email) return undefined
  const local = email.split('@')[0]
  if (!local) return undefined
  return local.charAt(0).toUpperCase() + local.slice(1)
}

export const usernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const me = await getAuthUserId(ctx)
    if (!USERNAME_RE.test(username)) return { ok: false, reason: 'invalid' as const }
    const hit = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (hit && hit.userId !== me) return { ok: false, reason: 'taken' as const }
    return { ok: true as const }
  }
})

export const updateDisplayName = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, { displayName }) => {
    const profile = await requireProfile(ctx)
    const trimmed = displayName.trim()
    if (trimmed.length < 1) throw new Error('Display name required')
    if (trimmed.length > DISPLAY_NAME_MAX) throw new Error('Display name too long')
    await ctx.db.patch(profile._id, { displayName: trimmed })
  }
})

export const updateBio = mutation({
  args: { bio: v.string() },
  handler: async (ctx, { bio }) => {
    const profile = await requireProfile(ctx)
    const trimmed = bio.trim()
    if (trimmed.length > BIO_MAX) throw new Error('Bio too long')
    await ctx.db.patch(profile._id, { bio: trimmed.length === 0 ? undefined : trimmed })
  }
})

const SHOWCASE_SLOTS = 4

export const setShowcaseSlot = mutation({
  args: { index: v.number(), item: v.union(v.null(), showcaseItemValidator) },
  handler: async (ctx, { index, item }) => {
    if (!Number.isInteger(index) || index < 0 || index >= SHOWCASE_SLOTS) {
      throw new Error('Invalid showcase slot')
    }
    const profile = await requireProfile(ctx)
    const next: Array<typeof item> = Array.from(
      { length: SHOWCASE_SLOTS },
      (_, i) => profile.showcase?.[i] ?? null
    )
    next[index] = item
    const empty = next.every((slot) => slot === null)
    await ctx.db.patch(profile._id, { showcase: empty ? undefined : next })
  }
})

export const updateUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await requireProfile(ctx)
    if (!USERNAME_RE.test(username)) throw new Error('Invalid username')
    if (username === profile.username) return
    const hit = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (hit) throw new Error('Username already taken')
    await ctx.db.patch(profile._id, { username })
  }
})

export const setAvatar = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const profile = await requireProfile(ctx)
    assertOwnedKey(key, AVATAR_PREFIX, profile.userId)
    const oldKey = extractKey(profile.avatarUrl)
    await ctx.db.patch(profile._id, { avatarUrl: publicUrl(key) })
    if (oldKey && oldKey !== key) {
      await ctx.scheduler.runAfter(0, internal.uploads.deleteObject, { key: oldKey })
    }
  }
})

export const setBanner = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const profile = await requireProfile(ctx)
    assertOwnedKey(key, BANNER_PREFIX, profile.userId)
    const oldKey = extractKey(profile.bannerUrl)
    await ctx.db.patch(profile._id, { bannerUrl: publicUrl(key) })
    if (oldKey && oldKey !== key) {
      await ctx.scheduler.runAfter(0, internal.uploads.deleteObject, { key: oldKey })
    }
  }
})

export const removeAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx)
    const oldKey = extractKey(profile.avatarUrl)
    await ctx.db.patch(profile._id, { avatarUrl: undefined })
    if (oldKey) {
      await ctx.scheduler.runAfter(0, internal.uploads.deleteObject, { key: oldKey })
    }
  }
})

export const removeBanner = mutation({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx)
    const oldKey = extractKey(profile.bannerUrl)
    await ctx.db.patch(profile._id, { bannerUrl: undefined })
    if (oldKey) {
      await ctx.scheduler.runAfter(0, internal.uploads.deleteObject, { key: oldKey })
    }
  }
})

export const getPrivacy = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (!profile) return null
    return {
      visibility: profile.visibility ?? 'public',
      hidePresence: profile.hidePresence ?? false,
      hideActivity: profile.hideActivity ?? false,
      defaultListVisibility: profile.defaultListVisibility ?? 'private'
    }
  }
})

export const updatePrivacy = mutation({
  args: {
    visibility: v.optional(v.union(v.literal('public'), v.literal('friends'), v.literal('hidden'))),
    hidePresence: v.optional(v.boolean()),
    hideActivity: v.optional(v.boolean()),
    defaultListVisibility: v.optional(v.union(v.literal('private'), v.literal('public')))
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    const patch: Partial<Doc<'profiles'>> = {}
    if (args.visibility !== undefined) patch.visibility = args.visibility
    if (args.hidePresence !== undefined) patch.hidePresence = args.hidePresence
    if (args.hideActivity !== undefined) patch.hideActivity = args.hideActivity
    if (args.defaultListVisibility !== undefined) {
      patch.defaultListVisibility = args.defaultListVisibility
    }
    await ctx.db.patch(profile._id, patch)
  }
})

async function uniqueUsername(ctx: MutationCtx | QueryCtx, base: string): Promise<string> {
  let candidate = base
  for (let suffix = 1; suffix < 1000; suffix++) {
    const hit = (await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', candidate))
      .unique()) as Doc<'profiles'> | null
    if (!hit) return candidate
    candidate = `${base}${suffix}`
  }
  throw new Error('Could not find unique username')
}
