import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { toPng } from 'html-to-image'
import './App.scss'

type IconState = {
  id: string
  label: string
  src: string
  xPercent: number
  yPercent: number
  size: number
  source: 'x' | 'upload'
}

type ToastState = {
  message: string
  id: number
}

const EXPORT_WIDTH = 1600
const EXPORT_HEIGHT = 900
const DEFAULT_ICON_SIZE = 84
const MAX_ICONS = 8

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function App() {
  let chartRef: HTMLDivElement | undefined
  let exportRef: HTMLDivElement | undefined
  const uploadedObjectUrls = new Set<string>()

  const [topLabel, setTopLabel] = createSignal('憧れ')
  const [bottomLabel, setBottomLabel] = createSignal('親近感')
  const [leftLabel, setLeftLabel] = createSignal('ゆるめ')
  const [rightLabel, setRightLabel] = createSignal('きりっと')
  const [xId, setXId] = createSignal('')
  const [icons, setIcons] = createSignal<IconState[]>([])
  const [toast, setToast] = createSignal<ToastState | null>(null)
  const [isDragging, setIsDragging] = createSignal(false)
  const [draggingIconId, setDraggingIconId] = createSignal<string | null>(null)
  const [offsetX, setOffsetX] = createSignal(0)
  const [offsetY, setOffsetY] = createSignal(0)

  let toastTimer: number | undefined

  const showError = (message: string) => {
    setToast({ message, id: Date.now() })
  }

  createEffect(() => {
    if (!toast()) {
      return
    }

    if (toastTimer) {
      window.clearTimeout(toastTimer)
    }

    toastTimer = window.setTimeout(() => {
      setToast(null)
    }, 3200)
  })

  onCleanup(() => {
    if (toastTimer) {
      window.clearTimeout(toastTimer)
    }
    uploadedObjectUrls.forEach((url) => URL.revokeObjectURL(url))
    uploadedObjectUrls.clear()
  })

  const placeIcon = (payload: { src: string; label: string; source: 'x' | 'upload' }) => {
    if (icons().length >= MAX_ICONS) {
      showError(`アイコンは最大 ${MAX_ICONS} 個までです。`)
      return false
    }

    setIcons((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: payload.label,
        source: payload.source,
        src: payload.src,
        xPercent: 50,
        yPercent: 50,
        size: DEFAULT_ICON_SIZE,
      },
    ])

    return true
  }

  const updateIcon = (iconId: string, updater: (icon: IconState) => IconState) => {
    setIcons((prev) => prev.map((icon) => (icon.id === iconId ? updater(icon) : icon)))
  }

  const clearAllIcons = () => {
    icons().forEach((icon) => {
      if (icon.source === 'upload') {
        URL.revokeObjectURL(icon.src)
        uploadedObjectUrls.delete(icon.src)
      }
    })
    setIcons([])
    setIsDragging(false)
    setDraggingIconId(null)
  }

  const removeIcon = (iconId: string) => {
    const target = icons().find((icon) => icon.id === iconId)
    if (target?.source === 'upload') {
      URL.revokeObjectURL(target.src)
      uploadedObjectUrls.delete(target.src)
    }

    setIcons((prev) => prev.filter((icon) => icon.id !== iconId))
    if (draggingIconId() === iconId) {
      setDraggingIconId(null)
      setIsDragging(false)
    }
  }

  const updateIconSize = (iconId: string, value: number) => {
    updateIcon(iconId, (icon) => ({
      ...icon,
      size: value,
    }))
  }

  const validateImage = (src: string) =>
    new Promise<void>((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image-load-failed'))
      img.src = src
    })

  const handleXSubmit = async (event: Event) => {
    event.preventDefault()
    const id = xId().trim()
    if (!id) {
      showError('X ID を入力してください。')
      return
    }

    const avatarUrl = `https://unavatar.io/x/${encodeURIComponent(id)}`

    try {
      await validateImage(avatarUrl)
      const added = placeIcon({
        src: avatarUrl,
        label: `@${id}`,
        source: 'x',
      })
      if (added) {
        setXId('')
      }
    } catch {
      showError('アイコンを取得できませんでした。IDを確認するか画像をアップロードしてください。')
    }
  }

  const handleUpload = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) {
      return
    }

    const objectUrl = URL.createObjectURL(file)
    uploadedObjectUrls.add(objectUrl)

    try {
      await validateImage(objectUrl)
      const added = placeIcon({
        src: objectUrl,
        label: file.name || 'uploaded image',
        source: 'upload',
      })
      if (!added) {
        URL.revokeObjectURL(objectUrl)
        uploadedObjectUrls.delete(objectUrl)
      }
    } catch {
      URL.revokeObjectURL(objectUrl)
      uploadedObjectUrls.delete(objectUrl)
      showError('画像の読み込みに失敗しました。別の画像で試してください。')
    } finally {
      input.value = ''
    }
  }

  const beginDrag = (event: PointerEvent, iconId: string) => {
    const currentIcon = icons().find((icon) => icon.id === iconId)
    if (!chartRef || !currentIcon) {
      return
    }

    const rect = chartRef.getBoundingClientRect()
    const iconCenterX = (currentIcon.xPercent / 100) * rect.width
    const iconCenterY = (currentIcon.yPercent / 100) * rect.height

    setOffsetX(event.clientX - rect.left - iconCenterX)
    setOffsetY(event.clientY - rect.top - iconCenterY)
    setDraggingIconId(iconId)
    setIsDragging(true)
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const dragMove = (event: PointerEvent) => {
    const targetIconId = draggingIconId()
    if (!isDragging() || !targetIconId || !chartRef) {
      return
    }

    const rect = chartRef.getBoundingClientRect()
    const x = event.clientX - rect.left - offsetX()
    const y = event.clientY - rect.top - offsetY()

    const nextX = clamp((x / rect.width) * 100, 0, 100)
    const nextY = clamp((y / rect.height) * 100, 0, 100)

    updateIcon(targetIconId, (icon) => ({
      ...icon,
      xPercent: nextX,
      yPercent: nextY,
    }))
  }

  const endDrag = () => {
    setIsDragging(false)
    setDraggingIconId(null)
  }

  const handleSizeChange = (event: Event, iconId: string) => {
    const value = Number((event.currentTarget as HTMLInputElement).value)
    updateIconSize(iconId, value)
  }

  const downloadPng = async () => {
    if (!exportRef) {
      return
    }

    try {
      const dataUrl = await toPng(exportRef, {
        cacheBust: true,
        pixelRatio: 1,
        canvasWidth: EXPORT_WIDTH,
        canvasHeight: EXPORT_HEIGHT,
      })

      const link = document.createElement('a')
      link.download = 'bunrui-chart.png'
      link.href = dataUrl
      link.click()
    } catch {
      showError('画像の書き出しに失敗しました。もう一度試してください。')
    }
  }

  return (
    <main class="app-shell container py-4 py-md-5">
      <header class="mb-4 text-center">
        <h1 class="title">Bunrui-Kun</h1>
        <p class="subtitle mb-0">X アイコンを軸マトリクスに置いて PNG 保存</p>
      </header>

      <section class="controls card shadow-sm mb-4">
        <div class="card-body">
          <div class="row g-3">
            <div class="col-sm-6 col-lg-3">
              <label class="form-label">上ラベル</label>
              <input
                class="form-control"
                value={topLabel()}
                onInput={(event) => setTopLabel(event.currentTarget.value)}
              />
            </div>
            <div class="col-sm-6 col-lg-3">
              <label class="form-label">下ラベル</label>
              <input
                class="form-control"
                value={bottomLabel()}
                onInput={(event) => setBottomLabel(event.currentTarget.value)}
              />
            </div>
            <div class="col-sm-6 col-lg-3">
              <label class="form-label">左ラベル</label>
              <input
                class="form-control"
                value={leftLabel()}
                onInput={(event) => setLeftLabel(event.currentTarget.value)}
              />
            </div>
            <div class="col-sm-6 col-lg-3">
              <label class="form-label">右ラベル</label>
              <input
                class="form-control"
                value={rightLabel()}
                onInput={(event) => setRightLabel(event.currentTarget.value)}
              />
            </div>

            <div class="col-lg-8">
              <form class="row g-2" onSubmit={handleXSubmit}>
                <div class="col-sm-8">
                  <label class="form-label">X ID からアイコン取得 (Enter)</label>
                  <input
                    class="form-control"
                    placeholder="example: hamapis"
                    value={xId()}
                    onInput={(event) => setXId(event.currentTarget.value)}
                  />
                </div>
                <div class="col-sm-4 d-grid align-content-end">
                  <button class="btn btn-primary mt-sm-4" type="submit">
                    追加して配置
                  </button>
                </div>
              </form>
            </div>

            <div class="col-lg-4">
              <label class="form-label">画像を直接アップロード</label>
              <input class="form-control" type="file" accept="image/*" onChange={handleUpload} />
            </div>

            <div class="col-md-6 d-flex gap-2 align-items-end justify-content-md-end ms-auto">
              <div class="text-muted small me-auto me-md-2">
                {icons().length} / {MAX_ICONS} アイコン
              </div>
              <button class="btn btn-outline-secondary" type="button" onClick={clearAllIcons}>
                取り消し (全アイコンを消す)
              </button>
              <button class="btn btn-success" type="button" onClick={downloadPng}>
                PNG ダウンロード (1600x900)
              </button>
            </div>

            <Show when={icons().length > 0}>
              <div class="col-12">
                <div class="icon-size-list">
                  <For each={icons()}>
                    {(currentIcon, index) => (
                      <div class="icon-size-item">
                        <div class="icon-size-meta">
                          <img src={currentIcon.src} alt={currentIcon.label} class="icon-size-preview" />
                          <div>
                            <div class="icon-size-title">
                              {index() + 1}. {currentIcon.label}
                            </div>
                            <div class="icon-size-value">{Math.round(currentIcon.size)} px</div>
                          </div>
                        </div>
                        <input
                          class="form-range"
                          type="range"
                          min="36"
                          max="180"
                          value={currentIcon.size}
                          onInput={(event) => handleSizeChange(event, currentIcon.id)}
                        />
                        <button
                          class="btn btn-sm btn-outline-danger"
                          type="button"
                          onClick={() => removeIcon(currentIcon.id)}
                        >
                          このアイコンを消す
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </section>

      <section class="chart-wrap" ref={exportRef}>
        <div class="label-top">{topLabel()}</div>
        <div class="label-bottom">{bottomLabel()}</div>
        <div class="label-left">{leftLabel()}</div>
        <div class="label-right">{rightLabel()}</div>

        <div
          class="chart-board"
          ref={chartRef}
          onPointerMove={dragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
        >
          <For each={icons()}>
            {(iconData) => (
              <img
                class="avatar-token"
                src={iconData.src}
                alt={iconData.label}
                draggable={false}
                style={{
                  left: `${iconData.xPercent}%`,
                  top: `${iconData.yPercent}%`,
                  width: `${iconData.size}px`,
                  height: `${iconData.size}px`,
                }}
                onPointerDown={(event) => beginDrag(event, iconData.id)}
              />
            )}
          </For>
        </div>
      </section>

      <Show when={toast()}>
        {(toastData) => (
          <div class="toast-wrap" role="status" aria-live="polite" data-toast-id={toastData().id}>
            <div class="alert alert-danger shadow-sm mb-0">{toastData().message}</div>
          </div>
        )}
      </Show>
    </main>
  )
}

export default App
