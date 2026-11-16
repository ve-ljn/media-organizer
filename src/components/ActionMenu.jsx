import { useEffect } from 'react'
import './ActionMenu.css'

// A reference card rather than a command palette: the bottom bar used to carry
// every hotkey at once, which crowded it and still got skimmed past. Pressing a
// key listed here runs it straight away — the viewer's own handler sees the
// keystroke and the menu dismisses itself — so nothing needs wiring twice.
function groupsFor({ tab, currentIsHeic }) {
  const isVideo = tab === 'videos'

  return [
    {
      title: 'Navigate',
      items: [
        { keys: ['←', '→'], label: 'Previous / next file' },
        { keys: ['Space'], label: isVideo ? 'Play / pause' : 'Next image' },
      ],
    },
    {
      title: 'Organize',
      items: [
        { keys: ['1', '–', '6'], label: 'Move to hotkey folder' },
        { keys: ['N'], label: 'Add a destination folder' },
        { keys: ['D', 'D'], label: 'Send to Recycle Bin' },
        { keys: ['Alt+1', '–', '5'], label: 'Rate, Alt+0 clears' },
      ],
    },
    {
      title: 'Edit',
      items: [
        { keys: ['C'], label: 'Crop' },
        { keys: ['T'], label: 'Rotate' },
        ...(isVideo ? [
          { keys: ['S'], label: 'Split at current position' },
          { keys: ['M', 'M'], label: 'Remove audio track' },
          { keys: ['F'], label: 'Save frame as PNG' },
        ] : []),
        ...(currentIsHeic ? [
          { keys: ['⇄'], label: 'Convert HEIC — use the top bar button' },
        ] : []),
      ],
    },
    {
      title: 'View',
      items: [
        { keys: ['scroll'], label: 'Zoom, 0 resets' },
        ...(isVideo ? [
          { keys: ['L'], label: 'Slideshow' },
          { keys: ['R'], label: 'Loop ±2s' },
        ] : []),
        { keys: ['E'], label: 'Show in Windows Explorer' },
        { keys: ['O'], label: 'Activity log' },
      ],
    },
  ]
}

export default function ActionMenu({ tab, currentIsHeic, onClose }) {
  // Closing on Escape is handled by the viewer, which also dismisses on any
  // action key; this only covers clicking away.
  useEffect(() => {
    const onDown = () => onClose()
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose])

  return (
    <div className="action-menu">
      <div className="action-menu-head">
        Actions <span className="action-menu-hint">press a key, or <kbd>.</kbd> to close</span>
      </div>

      <div className="action-menu-groups">
        {groupsFor({ tab, currentIsHeic }).map(group => (
          <div className="action-menu-group" key={group.title}>
            <div className="action-menu-title">{group.title}</div>
            {group.items.map(item => (
              <div className="action-menu-row" key={item.label}>
                <span className="action-menu-keys">
                  {item.keys.map((k, i) =>
                    k === '–' ? <span key={i} className="action-menu-dash">–</span>
                              : <kbd key={i}>{k}</kbd>)}
                </span>
                <span className="action-menu-label">{item.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
