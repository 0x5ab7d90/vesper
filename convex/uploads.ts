'use node'

import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { Files } from 'files-sdk'
import { r2 } from 'files-sdk/r2'
import { nanoid } from 'nanoid'
import { action, internalAction } from './_generated/server'

const AVATAR_PREFIX = 'avatars'
const BANNER_PREFIX = 'banners'
const LIST_COVER_PREFIX = 'list-covers'
const URL_EXPIRES_SECONDS = 300
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

function getFiles(): Files {
  return new Files({
    adapter: r2({
      bucket: process.env.R2_BUCKET!,
      accountId: process.env.R2_ACCOUNT_ID!,
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
    })
  })
}

function extFor(contentType: string, allowGif: boolean): string {
  const ext = MIME_TO_EXT[contentType]
  if (!ext || (ext === 'gif' && !allowGif)) {
    throw new Error(`Unsupported content type: ${contentType}`)
  }
  return ext
}

async function signFor(
  prefix: string,
  userId: string,
  contentType: string,
  allowGif = false
): Promise<{
  key: string
  url: string
  headers: Record<string, string>
}> {
  const key = `${prefix}/${userId}/${nanoid(12)}.${extFor(contentType, allowGif)}`
  const files = getFiles()
  const signed = await files.signedUploadUrl(key, {
    expiresIn: URL_EXPIRES_SECONDS,
    contentType
  })
  if (signed.method !== 'PUT') throw new Error('Expected PUT signed upload')
  return { key, url: signed.url, headers: signed.headers ?? {} }
}

export const signAvatarUpload = action({
  args: { contentType: v.string() },
  handler: async (ctx, { contentType }) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not authenticated')
    return await signFor(AVATAR_PREFIX, userId, contentType, true)
  }
})

export const signBannerUpload = action({
  args: { contentType: v.string() },
  handler: async (ctx, { contentType }) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not authenticated')
    return await signFor(BANNER_PREFIX, userId, contentType)
  }
})

export const signListCoverUpload = action({
  args: { contentType: v.string() },
  handler: async (ctx, { contentType }) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not authenticated')
    return await signFor(LIST_COVER_PREFIX, userId, contentType)
  }
})

export const deleteObject = internalAction({
  args: { key: v.string() },
  handler: async (_ctx, { key }) => {
    const files = getFiles()
    await files.delete(key).catch(() => undefined)
  }
})
