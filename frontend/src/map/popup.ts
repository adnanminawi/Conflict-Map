
export function buildPopup(title: string, subtitle: string, lines: (string | null)[]) {
  const box = document.createElement('div')
  box.className = 'popup'

  // Title
  const titleEl = document.createElement('h3')
  titleEl.textContent = title
  titleEl.dir = 'auto'
  box.appendChild(titleEl)

  // Subtitle (the type, e.g. "Airport")
  const subtitleEl = document.createElement('p')
  subtitleEl.textContent = subtitle
  subtitleEl.className = 'type'
  subtitleEl.dir = 'auto'
  box.appendChild(subtitleEl)

  // Extra lines — empty ones are skipped
  for (const line of lines) {
    if (!line) continue
    const lineEl = document.createElement('p')
    lineEl.textContent = line
    lineEl.dir = 'auto'
    box.appendChild(lineEl)
  }

  return box
}