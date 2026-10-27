// Real archive photographs used as prototype art, separate from programme stills.
const moonWalk = Object.freeze({
  image: '/artwork/moon-walking.jpg', index: '01',
  alt: 'A subject suspended sideways in NASA’s Moon-walking simulator.',
  title: 'Simulating a Moon walk', credit: 'NASA / Langley',
  source: 'https://www.nasa.gov/centers-and-facilities/langley/50-years-ago-the-lunar-landing-research-facility/'
});
const radioHat = Object.freeze({
  image: '/artwork/radio-hat.jpg', index: '02',
  alt: 'A man reading a newspaper while wearing a straw hat fitted with a portable radio, 1931.',
  title: 'Portable radio in a straw hat, 1931', credit: 'Nationaal Archief / Spaarnestad',
  source: 'https://commons.wikimedia.org/wiki/File:Draagbare_radio_-_Radio_hat_(4193509510).jpg'
});

// Each transmission can choose its edition/artwork in config/content.json.
// A clip-kind fallback keeps old catalogues working without an editorial file.
const editions=['cobalt','coral','citrus','nocturne'];
export function strandTheme(event={}) {
  const explicit=event.presentation?.theme;
  if (editions.includes(explicit)) return explicit;
  if (['advert','trailer'].includes(event.kind)) return 'coral';
  if (event.kind==='ident') return 'citrus';
  if (['public-information','interstitial'].includes(event.kind) || event.asset==='feature') return 'nocturne';
  return 'cobalt';
}
export function artDirection(event = {}) {
  const fallback=['advert','trailer','public-information','interstitial'].includes(event.kind) ? radioHat : moonWalk;
  const art=event.presentation?.artwork==='moon-walking' ? moonWalk : event.presentation?.artwork==='radio-hat' ? radioHat : fallback;
  return {...art, theme:strandTheme(event)};
}
