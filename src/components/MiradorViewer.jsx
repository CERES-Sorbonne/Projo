import { useEffect, useRef, useState } from 'react'

export default function MiradorViewer({ manifestUrl }) {
  const conteneurRef = useRef(null)
  const miradorRef = useRef(null)
  const [pret, setPret] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setPret(true), 300)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!pret || !conteneurRef.current || miradorRef.current) return

    const conteneur = conteneurRef.current

    import('mirador').then((mod) => {
      const viewer = mod.viewer ?? mod.default?.viewer
      if (!viewer || miradorRef.current) return

      miradorRef.current = viewer({
        id: conteneur.id,
        manifests: { [manifestUrl]: {} },
        windows: [{
          manifestId: manifestUrl,
          thumbnailNavigationPosition: 'far-bottom',
          canvasIndex: 0,
          view: 'single',
        }],
        workspace: {
          showZoomControls: true,
          type: 'mosaic',
        },
        workspaceControlPanel: { enabled: false },
        osdConfig: {
          webGLEnabled: false,
        },
        theme: {
          palette: {
            primary: { main: '#1a237e' },
            secondary: { main: '#b71c1c' },
          },
        },
      })
    }).catch(err => console.error('Erreur Mirador:', err))
  }, [pret, manifestUrl])

  return (
    <div
      id="mirador-viewer"
      ref={conteneurRef}
      style={{
        width: '100%',
        height: '70vh',
        minHeight: '500px',
        display: 'block',
        position: 'relative',
      }}
    />
  )
}