import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * CloverViewer — wrapper autour de @samvera/clover-iiif/viewer
 * Utiliser avec client:only="react" dans Astro.
 *
 * Synchro via CustomEvents :
 *   'clover:goto'        { detail: { index } }  reçu  — transcription → viewer
 *   'clover:pagechange'  { detail: { index } }  émis  — viewer → transcription
 *
 * La direction transcription → viewer passe par un plugin invisible qui a accès
 * à useViewerDispatch — l'API officielle de Clover pour piloter son état interne.
 * C'est la seule méthode fiable : modifier iiifContent ne déclenche pas de
 * navigation programmatique, et canvasIdCallback est en lecture seule.
 */

// ── Plugin invisible : reçoit useViewerDispatch et pilote le canvas actif ─────
function SyncPlugin({ useViewerDispatch, useViewerState, canvasIdsRef, ignoreNextRef }) {
  const dispatch = useViewerDispatch()
  const state    = useViewerState()

  // Transcrire l'index demandé en action Clover dès réception de clover:goto
  useEffect(() => {
    const handler = (e) => {
      const targetIndex = e.detail?.index ?? 0
      const canvasId    = canvasIdsRef.current[targetIndex]
      if (!canvasId) return

      // Vérifier si Clover est déjà sur ce canvas (évite les re-renders inutiles)
      const currentId = state?.activeCanvas
      if (currentId === canvasId) return

      ignoreNextRef.current = true

      // Action officielle Clover pour changer de canvas
      dispatch({ type: 'updateActiveCanvas', canvasId })
    }

    window.addEventListener('clover:goto', handler)
    return () => window.removeEventListener('clover:goto', handler)
  }, [dispatch, state, canvasIdsRef, ignoreNextRef])

  return null  // composant invisible
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function CloverViewer({ manifestUrl }) {
  const [ViewerComponent, setViewerComponent] = useState(null)

  const canvasIdsRef   = useRef([])
  const ignoreNextRef  = useRef(false)
  const pendingIndexRef = useRef(null)

  // ── Charger Viewer dynamiquement (évite document is not defined au build) ────
  useEffect(() => {
    import('@samvera/clover-iiif/viewer').then(mod => {
      setViewerComponent(() => mod.default ?? mod.Viewer)
    })
  }, [])

  // ── Charger les canvas IDs depuis le manifeste ────────────────────────────────
  useEffect(() => {
    fetch(manifestUrl)
      .then(r => r.json())
      .then(manifest => {
        const items = manifest.items ?? manifest.sequences?.[0]?.canvases ?? []
        canvasIdsRef.current = items.map(c => c.id ?? c['@id']).filter(Boolean)
        // Appliquer un goto qui aurait été reçu avant la fin du fetch
        if (pendingIndexRef.current !== null) {
          window.dispatchEvent(
            new CustomEvent('clover:goto', { detail: { index: pendingIndexRef.current } })
          )
          pendingIndexRef.current = null
        }
      })
      .catch(() => {})
  }, [manifestUrl])

  // ── Mettre en file d'attente les goto arrivant avant le fetch ────────────────
  useEffect(() => {
    const handler = (e) => {
      if (canvasIdsRef.current.length === 0) {
        // Manifeste pas encore chargé : mémoriser l'index
        pendingIndexRef.current = e.detail?.index ?? 0
      }
      // Si le manifeste est chargé, le SyncPlugin prend le relais directement
    }
    window.addEventListener('clover:goto', handler)
    return () => window.removeEventListener('clover:goto', handler)
  }, [])

  // ── Viewer → Transcription (canvasIdCallback) ─────────────────────────────────
  const handleCanvasIdCallback = useCallback((canvasId) => {
    if (!canvasId) return

    if (ignoreNextRef.current) {
      ignoreNextRef.current = false
      return
    }

    const index = canvasIdsRef.current.indexOf(canvasId)
    if (index === -1) return

    window.dispatchEvent(
      new CustomEvent('clover:pagechange', { detail: { index } })
    )
  }, [])

  if (!ViewerComponent) return null

  // Le plugin est enregistré via la prop `plugins` du Viewer Clover.
  // Il est rendu dans imageViewer.controls (zone invisible) et reçoit
  // useViewerDispatch / useViewerState comme props automatiquement.
  const plugins = [{
    imageViewer: {
      controls: {
        component: SyncPlugin,
        componentProps: { canvasIdsRef, ignoreNextRef },
      },
    },
  }]

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', zIndex: 0 }}>
      <ViewerComponent
        iiifContent={manifestUrl}
        canvasIdCallback={handleCanvasIdCallback}
        plugins={plugins}
        options={{
          canvasHeight: '100%',
          showIIIFBadge: false,
          showTitle: false,
          informationPanel: { open: false, renderToggle: false },
          background: 'transparent',
        }}
        customTheme={{
          colors: {
            primary:        '#374380',
            primaryMuted:   '#5a64a8',
            primaryAlt:     '#1a237e',
            accent:         '#b71c1c',
            accentMuted:    '#e57373',
            accentAlt:      '#7f0000',
            secondary:      '#ffffff',
            secondaryMuted: '#f5f5f5',
            secondaryAlt:   '#e0e0e0',
          },
        }}
      />
    </div>
  )
}