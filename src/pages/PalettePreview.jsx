import { useState } from 'react'
import { CartProvider } from '../lib/CartContext'
import { ShopView } from './ShopPage'
import './palettePreview.css'

const palettes = [
  { id: 'cream-blue-yellow', name: 'Cream, Blue & Yellow', accent: '#1546D9', yellow: '#F9B318', dark: '#121212', surface: '#1C1C1C', raised: '#262626', light: '#EDECE6', ink: '#20232C', description: 'The current shop theme.' },
  { id: 'orange', name: 'Orange & Vanilla', accent: '#FC6C26', dark: '#121212', surface: '#1C1C1C', raised: '#262626', light: '#FFF4D6', ink: '#242424', description: 'The original source palette.' },
  { id: 'mint', name: 'Mint & Midnight', accent: '#63E6BE', dark: '#101918', surface: '#182422', raised: '#22332F', light: '#F1FAF5', ink: '#152E27', description: 'My pick: fresh mint with a calm dark background.' },
  { id: 'coral', name: 'Coral & Ink', accent: '#FF7A70', dark: '#141820', surface: '#1D2330', raised: '#293244', light: '#FFF5F2', ink: '#33242A', description: 'A softer, playful alternative to orange.' },
  { id: 'lavender', name: 'Lavender & Graphite', accent: '#B8A0FF', dark: '#17151F', surface: '#231F30', raised: '#302A41', light: '#F7F4FF', ink: '#2C2240', description: 'A mellow purple accent for a quieter feel.' },
  { id: 'sky', name: 'Sky & Slate', accent: '#7CC9FF', dark: '#101B2A', surface: '#19283C', raised: '#23374E', light: '#F1F8FF', ink: '#182D44', description: 'Bright blue accents on a crisp slate background.' },
]

function paletteTokens(palette, theme) {
  const dark = theme === 'dark'
  const bg = dark ? palette.dark : palette.light
  const rgb = palette.accent.match(/[\da-f]{2}/gi).map(value => parseInt(value, 16)).join(', ')
  return {
    '--brand-blue': palette.accent,
    '--brand-yellow': palette.yellow || palette.accent,
    '--brand-cream': palette.light,
    '--bg': bg,
    '--surface': dark ? palette.surface : '#FFFFFF',
    '--surface2': dark ? palette.raised : palette.light,
    '--border': dark ? '#FFFFFF24' : '#00000020',
    '--border-hover': dark ? '#FFFFFF55' : '#00000045',
    '--text': dark ? palette.light : palette.ink,
    '--text-secondary': dark ? '#C7CBD1' : '#555B65',
    '--text-hint': dark ? '#A3A9B3' : '#68707A',
    '--accent': palette.accent,
    '--accent-rgb': rgb,
    '--accent-ink': dark && palette.id === 'cream-blue-yellow' ? '#8EA9FF' : dark ? palette.accent : `color-mix(in srgb, ${palette.accent} 75%, #000000)`,
    '--accent-text': palette.id === 'cream-blue-yellow' ? '#FFFFFF' : palette.ink,
    '--sample-icon-text': palette.id === 'cream-blue-yellow' ? '#FFFFFF' : palette.id === 'orange' ? palette.light : palette.ink,
    '--accent-dim': `rgba(${rgb}, .14)`,
    '--header-bg': `${bg}F2`,
    '--cart-bg': palette.yellow || palette.accent,
    '--cart-hover': `color-mix(in srgb, ${palette.yellow || palette.accent} 90%, #000000)`,
    '--cart-text': palette.ink,
  }
}

export default function PalettePreview({ products }) {
  const params = new URLSearchParams(window.location.search)
  const [paletteId, setPaletteId] = useState(() => palettes.some(item => item.id === params.get('palette')) ? params.get('palette') : 'cream-blue-yellow')
  const [theme, setTheme] = useState(() => params.get('theme') === 'dark' ? 'dark' : 'light')
  const palette = palettes.find(item => item.id === paletteId)

  const select = (nextPalette, nextTheme) => {
    setPaletteId(nextPalette)
    setTheme(nextTheme)
    const url = new URL(window.location.href)
    url.searchParams.set('palette', nextPalette)
    url.searchParams.set('theme', nextTheme)
    window.history.replaceState(window.history.state, '', url)
  }
  const toggleTheme = () => select(paletteId, theme === 'dark' ? 'light' : 'dark')
  const iconText = palette.id === 'cream-blue-yellow' ? '#FFFFFF' : palette.id === 'orange' ? palette.light : palette.ink
  const logoUrl = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${palette.accent}"/><text x="50" y="76" text-anchor="middle" font-family="Arial,sans-serif" font-size="80" font-weight="900" fill="${iconText}">S</text></svg>`)}`

  const toolbar = <section className="palette-sampler" aria-label="Colour samples">
    <div className="palette-sampler-inner">
      <div className="palette-sampler-heading">
        <div><span className="eyebrow">TRY A DIFFERENT MOOD</span><h2>Colour samples</h2><p>Same shop, five palettes. Choose one to see it below.</p></div>
        <div className="palette-mode" aria-label="Preview appearance">
          {['dark', 'light'].map(mode => <button type="button" key={mode} aria-pressed={theme === mode} onClick={() => select(paletteId, mode)}>{mode === 'dark' ? 'Dark' : 'Light'}</button>)}
        </div>
      </div>
      <div className="palette-options" aria-label="Choose a colour palette">
        {palettes.map(item => <button type="button" className="palette-option" key={item.id} aria-pressed={paletteId === item.id} onClick={() => select(item.id, theme)}>
          <span className="palette-swatches" aria-hidden="true"><i style={{ background: item.accent }} /><i style={{ background: theme === 'dark' ? item.dark : item.light }} /><i style={{ background: item.light }} /></span>
          <strong>{item.name}</strong><small>{item.accent} / {theme === 'dark' ? item.dark : item.light}</small>
        </button>)}
      </div>
      <div className="palette-sampler-note"><p aria-live="polite">{palette.description}</p><span>Local preview only</span></div>
    </div>
  </section>

  return <CartProvider><ShopView products={products} displayName="Abhinav" preview previewToolbar={toolbar} previewAppearance={{ theme, onToggleTheme: toggleTheme, tokens: paletteTokens(palette, theme), logoUrl }} /></CartProvider>
}
