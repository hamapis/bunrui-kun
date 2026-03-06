import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { toPng } from 'html-to-image'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import './App.scss'

type IconState = {
  id: string
  label: string
  src: string
  xPercent: number
  yPercent: number
  size: number
  source: 'x' | 'upload'
  xId?: string
}

type ToastState = {
  message: string
  id: number
}

type PersistedState = {
  v: number
  t: string
  b: string
  l: string
  r: string
  i: Array<{
    x: string
    px: number
    py: number
    s: number
  }>
}

const DEFAULT_ICON_SIZE = 84
const MAX_ICONS = 16
const STATE_VERSION = 1
const STATE_QUERY_KEY = 'state'

const DEFAULT_TOP_LABEL = '憧れ'
const DEFAULT_BOTTOM_LABEL = '親近感'
const DEFAULT_LEFT_LABEL = 'ゆるめ'
const DEFAULT_RIGHT_LABEL = 'きりっと'

function avatarUrlFromXId(xId: string) {
  return `https://unavatar.io/x/${encodeURIComponent(xId)}`
}

function decodeStateParam(raw: string): PersistedState | null {
  const decompressed = decompressFromEncodedURIComponent(raw)
  if (decompressed) {
    try {
      return JSON.parse(decompressed) as PersistedState
    } catch {
      return null
    }
  }

  // Backward compatibility: allow old plain JSON query values.
  try {
    const legacy = JSON.parse(raw) as {
      version?: number
      topLabel?: string
      bottomLabel?: string
      leftLabel?: string
      rightLabel?: string
      icons?: Array<{
        label?: string
        xPercent?: number
        yPercent?: number
        size?: number
      }>
    }

    if (legacy.version !== STATE_VERSION) {
      return null
    }

    const items = Array.isArray(legacy.icons)
      ? legacy.icons
          .map((icon) => {
            const x = String(icon.label || '').replace(/^@/, '').trim()
            if (!x) {
              return null
            }

            return {
              x,
              px: clamp(Number(icon.xPercent) || 50, 0, 100),
              py: clamp(Number(icon.yPercent) || 50, 0, 100),
              s: clamp(Number(icon.size) || DEFAULT_ICON_SIZE, 36, 180),
            }
          })
          .filter((icon): icon is { x: string; px: number; py: number; s: number } => Boolean(icon))
      : []

    return {
      v: STATE_VERSION,
      t: legacy.topLabel ?? DEFAULT_TOP_LABEL,
      b: legacy.bottomLabel ?? DEFAULT_BOTTOM_LABEL,
      l: legacy.leftLabel ?? DEFAULT_LEFT_LABEL,
      r: legacy.rightLabel ?? DEFAULT_RIGHT_LABEL,
      i: items,
    }
  } catch {
    return null
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function App() {
  let chartRef: HTMLDivElement | undefined
  let exportRef: HTMLDivElement | undefined

  const [topLabel, setTopLabel] = createSignal(DEFAULT_TOP_LABEL)
  const [bottomLabel, setBottomLabel] = createSignal(DEFAULT_BOTTOM_LABEL)
  const [leftLabel, setLeftLabel] = createSignal(DEFAULT_LEFT_LABEL)
  const [rightLabel, setRightLabel] = createSignal(DEFAULT_RIGHT_LABEL)
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
  })

  onMount(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const raw = params.get(STATE_QUERY_KEY)
      if (!raw) {
        return
      }

      const parsed = decodeStateParam(raw)
      if (!parsed || parsed.v !== STATE_VERSION) {
        return
      }

      setTopLabel(parsed.t ?? DEFAULT_TOP_LABEL)
      setBottomLabel(parsed.b ?? DEFAULT_BOTTOM_LABEL)
      setLeftLabel(parsed.l ?? DEFAULT_LEFT_LABEL)
      setRightLabel(parsed.r ?? DEFAULT_RIGHT_LABEL)

      const restoredIcons: IconState[] = Array.isArray(parsed.i)
        ? parsed.i.slice(0, MAX_ICONS).map((icon): IconState => ({
            id: crypto.randomUUID(),
            label: `@${icon.x}`,
            src: avatarUrlFromXId(icon.x),
            xId: icon.x,
            xPercent: clamp(Number(icon.px) || 50, 0, 100),
            yPercent: clamp(Number(icon.py) || 50, 0, 100),
            size: clamp(Number(icon.s) || DEFAULT_ICON_SIZE, 36, 180),
            source: 'x',
          }))
        : []

      setIcons(restoredIcons.filter((icon) => icon.src))
    } catch {
      showError('URLクエリの復元に失敗しました。')
    }
  })

  createEffect(() => {
    const shareableIcons = icons()
      .filter((icon) => icon.source === 'x')
      .map((icon) => ({
        x: icon.xId ?? icon.label.replace(/^@/, '').trim(),
        px: Math.round(icon.xPercent * 10) / 10,
        py: Math.round(icon.yPercent * 10) / 10,
        s: Math.round(icon.size),
      }))
      .filter((icon) => icon.x)

    const snapshot: PersistedState = {
      v: STATE_VERSION,
      t: topLabel(),
      b: bottomLabel(),
      l: leftLabel(),
      r: rightLabel(),
      i: shareableIcons,
    }

    try {
      const params = new URLSearchParams(window.location.search)
      const isDefaultState =
        topLabel() === DEFAULT_TOP_LABEL &&
        bottomLabel() === DEFAULT_BOTTOM_LABEL &&
        leftLabel() === DEFAULT_LEFT_LABEL &&
        rightLabel() === DEFAULT_RIGHT_LABEL &&
        shareableIcons.length === 0

      if (isDefaultState) {
        params.delete(STATE_QUERY_KEY)
      } else {
        params.set(STATE_QUERY_KEY, compressToEncodedURIComponent(JSON.stringify(snapshot)))
      }

      const query = params.toString()
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    } catch {
      // Ignore URL serialization errors.
    }
  })

  const resetState = () => {
    setTopLabel(DEFAULT_TOP_LABEL)
    setBottomLabel(DEFAULT_BOTTOM_LABEL)
    setLeftLabel(DEFAULT_LEFT_LABEL)
    setRightLabel(DEFAULT_RIGHT_LABEL)
    setXId('')
    setIcons([])
    setIsDragging(false)
    setDraggingIconId(null)
  }

  const placeIcon = (payload: {
    src: string
    label: string
    source: 'x' | 'upload'
    xId?: string
  }) => {
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
        xId: payload.xId,
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
    setIcons([])
    setIsDragging(false)
    setDraggingIconId(null)
  }

  const removeIcon = (iconId: string) => {
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

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('file-read-failed'))
      reader.readAsDataURL(file)
    })

  const handleXSubmit = async (event: Event) => {
    event.preventDefault()
    const id = xId().trim()
    if (!id) {
      showError('X ID を入力してください。')
      return
    }

    const avatarUrl = avatarUrlFromXId(id)

    try {
      await validateImage(avatarUrl)
      const added = placeIcon({
        src: avatarUrl,
        label: `@${id}`,
        source: 'x',
        xId: id,
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

    try {
      const dataUrl = await readFileAsDataUrl(file)
      await validateImage(dataUrl)
      const added = placeIcon({
        src: dataUrl,
        label: file.name || 'uploaded image',
        source: 'upload',
      })
      if (!added) {
        showError(`アイコンは最大 ${MAX_ICONS} 個までです。`)
      }
    } catch {
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

    let prevWidth = ''
    let prevMaxWidth = ''
    let prevMargin = ''
    let prevBoxSizing = ''

    try {
      const sourceRect = exportRef.getBoundingClientRect()
      const sourceWidth = Math.ceil(sourceRect.width)
      const sourceHeight = Math.ceil(sourceRect.height)

      prevWidth = exportRef.style.width
      prevMaxWidth = exportRef.style.maxWidth
      prevMargin = exportRef.style.margin
      prevBoxSizing = exportRef.style.boxSizing

      exportRef.style.width = `${sourceWidth}px`
      exportRef.style.maxWidth = 'none'
      exportRef.style.margin = '0'
      exportRef.style.boxSizing = 'border-box'

      await new Promise((resolve) => window.requestAnimationFrame(resolve))

      const dataUrl = await toPng(exportRef, {
        cacheBust: true,
        pixelRatio: 2,
        skipAutoScale: true,
        canvasWidth: sourceWidth,
        canvasHeight: sourceHeight,
      })

      const link = document.createElement('a')
      link.download = 'bunrui-chart.png'
      link.href = dataUrl
      link.click()
    } catch {
      showError('画像の書き出しに失敗しました。もう一度試してください。')
    } finally {
      exportRef.style.width = prevWidth
      exportRef.style.maxWidth = prevMaxWidth
      exportRef.style.margin = prevMargin
      exportRef.style.boxSizing = prevBoxSizing
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
                    placeholder="example: elonmusk"
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
              <button class="btn btn-outline-dark" type="button" onClick={resetState}>
                状態を初期化
              </button>
              <button class="btn btn-outline-secondary" type="button" onClick={clearAllIcons}>
                取り消し (全アイコンを消す)
              </button>
              <button class="btn btn-success" type="button" onClick={downloadPng}>
                PNG ダウンロード
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
