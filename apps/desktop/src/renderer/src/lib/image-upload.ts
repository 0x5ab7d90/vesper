import { ConvexReactClient } from 'convex/react'
import { api } from '@convex/_generated/api'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const MAX_AVATAR_UPLOAD_BYTES = 10 * 1024 * 1024
export const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
/** Avatars also accept GIFs. They upload untouched so the animation survives. */
export const ALLOWED_AVATAR_TYPES = [...ALLOWED_TYPES, 'image/gif']

export interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

export async function cropAndEncode(
  src: string,
  area: CropArea,
  targetW: number,
  targetH: number,
  quality = 0.85
): Promise<Blob> {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2d unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, targetW, targetH)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encode failed'))),
      'image/jpeg',
      quality
    )
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export type UploadKind = 'avatar' | 'banner' | 'listCover'

export async function uploadProfileImage(
  convex: ConvexReactClient,
  kind: 'avatar' | 'banner',
  blob: Blob
): Promise<void> {
  const signer = kind === 'avatar' ? api.uploads.signAvatarUpload : api.uploads.signBannerUpload
  const setter = kind === 'avatar' ? api.profiles.setAvatar : api.profiles.setBanner
  const signed = await convex.action(signer, { contentType: blob.type })
  const res = await fetch(signed.url, { method: 'PUT', body: blob, headers: signed.headers })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  await convex.mutation(setter, { key: signed.key })
}

export async function uploadListCover(convex: ConvexReactClient, blob: Blob): Promise<string> {
  const signed = await convex.action(api.uploads.signListCoverUpload, { contentType: blob.type })
  const res = await fetch(signed.url, { method: 'PUT', body: blob, headers: signed.headers })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return signed.key
}
