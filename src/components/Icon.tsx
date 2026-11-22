import { MorphIcon } from 'morphicons/react'
const shapes = {
  play: 'M7 4.8L20 12 7 19.2Z', pause: 'M8 5v14M16 5v14',
  stop: 'M6 6h12v12H6z', music: 'M9 17V6l11-2v11M9 8l11-2M9 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0M20 15a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  library: 'M4 4v16M8 4v16M12 5v15M15 5l5 14', search: 'M16 16l5 5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
  import: 'M12 15V3m-5 5 5-5 5 5M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5',
  sliders: 'M3 7h5m4 0h9M3 17h10m4 0h4M10 4v6m5 4v6',
  headphones: 'M4 15v-3a8 8 0 0 1 16 0v3M4 13h3v7H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 1-2M20 13h-3v7h2a2 2 0 0 0 2-2v-3a2 2 0 0 0-1-2',
  game: 'M7 7h10c2 0 3 1 3.5 3l1 5c.8 4-2 5-4 2l-2-2h-7l-2 2c-2 3-4.5 2-4-1l1.2-6Q4.2 7 7 7ZM6 11h5m-2.5-2.5v5M16 10h.2m2.2 2h.2',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2',
  wave: 'M3 10v4m4-8v12m5-15v18m5-15v12m4-8v4',
  keys: 'M3 5h18v14H3zM7 5v8m4-8v8m5-8v8', close: 'M5 5l14 14M19 5 5 19',
  tray: 'M3 4h18v12H3zM8 20h8m-4-4v4', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  volume: 'M3 9h4l5-4v14l-5-4H3zM16 9a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12',
  mute: 'M3 9h4l5-4v14l-5-4H3zM16 9l5 6m0-6-5 6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7',
  folder: 'M3 7V5h6l3 3h9v11H3z', check: 'M4 12l5 5L20 6',
  arrow: 'M5 12h14m-6-6 6 6-6 6', chevron: 'M8 10l4 4 4-4',
  disc: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0m-6 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 11v6m0-10v.2',
}
export type IconName = keyof typeof shapes
export function Icon({ name, size = 19 }: { name: IconName; size?: number }) {
  return <MorphIcon icon={shapes[name]} size={size} strokeWidth={1.7} spring="snappy" reducedMotion="user" aria-hidden="true" />
}
