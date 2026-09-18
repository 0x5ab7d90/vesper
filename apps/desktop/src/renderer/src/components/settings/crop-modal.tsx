import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Cropper, { type Area } from 'react-easy-crop'
import { Button } from '@renderer/components/ui/button'
import { DialSlider } from '@renderer/components/ui/dial-slider'
import { Ring } from '@renderer/components/ui/spinner'
import { SquircleSurface } from '@renderer/components/ui/squircle-surface'
import {
  ALLOWED_TYPES,
  MAX_AVATAR_UPLOAD_BYTES,
  MAX_UPLOAD_BYTES,
  cropAndEncode,
  type UploadKind
} from '@renderer/lib/image-upload'

interface CropModalProps {
  open: boolean
  kind: UploadKind
  file: File | null
  onCancel: () => void
  onConfirm: (blob: Blob) => void | Promise<void>
}

const TARGETS = {
  avatar: { width: 512, height: 512, aspect: 1, shape: 'round' as const },
  banner: { width: 1600, height: 400, aspect: 4, shape: 'rect' as const },
  listCover: { width: 800, height: 800, aspect: 1, shape: 'rect' as const }
}

export function CropModal({
  open,
  kind,
  file,
  onCancel,
  onConfirm
}: CropModalProps): React.JSX.Element | null {
  const [src, setSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [cropArea, setCropArea] = useState<Area | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const target = TARGETS[kind]

  useEffect(() => {
    if (!file || !open) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      setSrc(null)
      return
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Use PNG, JPEG, or WEBP')
      return
    }
    const maxBytes = kind === 'avatar' ? MAX_AVATAR_UPLOAD_BYTES : MAX_UPLOAD_BYTES
    if (file.size > maxBytes) {
      setError(`Max ${maxBytes / (1024 * 1024)} MB`)
      return
    }
    setError(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    setSrc(url)
    return (): void => {
      URL.revokeObjectURL(url)
      objectUrlRef.current = null
    }
  }, [file, open, kind])

  const handleCropComplete = useCallback((_: Area, area: Area) => {
    setCropArea(area)
  }, [])

  const handleConfirm = async (): Promise<void> => {
    if (!src || !cropArea) return
    setSaving(true)
    try {
      const blob = await cropAndEncode(src, cropArea, target.width, target.height)
      await onConfirm(blob)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <SquircleSurface
        variant="frame"
        className="max-h-[92vh] w-[520px] max-w-full gap-3 overflow-y-auto p-1.5 shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
      >
        <header className="flex items-center justify-between pt-1.5 pb-0 pl-2.5 pr-2">
          <h2 className="text-[15px] font-medium text-text">
            {kind === 'avatar' ? 'Crop avatar' : kind === 'banner' ? 'Crop banner' : 'Crop cover'}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-[12px] font-medium text-text-tertiary outline-none hover:text-text"
          >
            Cancel
          </button>
        </header>
        <SquircleSurface
          variant="inset"
          className="relative w-full shrink-0 overflow-hidden"
          style={{
            height: kind === 'banner' ? 'min(240px, 36vh)' : 'min(320px, 48vh)'
          }}
        >
          {src ? (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={target.aspect}
              cropShape={target.shape}
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-text-muted">
              {error ?? 'No image selected'}
            </div>
          )}
        </SquircleSurface>
        <div className="px-1.5">
          <DialSlider label="Zoom" value={zoom} min={1} max={3} step={0.01} onChange={setZoom} />
        </div>
        {error ? <p className="px-1.5 text-[12px] font-medium text-red-400">{error}</p> : null}
        <div className="flex justify-end gap-2 px-1 pb-0.5">
          <Button
            variant="primary"
            size="sm"
            className="rounded-md"
            disabled={!src || !cropArea || saving}
            onClick={handleConfirm}
          >
            {saving ? (
              <span className="inline-flex items-center gap-1.5">
                Saving
                <Ring className="size-3.5" />
              </span>
            ) : (
              'Save'
            )}
          </Button>
        </div>
      </SquircleSurface>
    </div>,
    document.body
  )
}
