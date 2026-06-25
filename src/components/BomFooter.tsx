import { useMemo } from 'react'
import { computeBom } from '@/lib/bom'
import type { BomLine } from '@/lib/bom'
import type { ElementCollection } from '@/elements/types'

type BomFooterProps = {
  elements: ElementCollection
}

const fmtM = (meters: number) => `${meters.toFixed(2)} m`

function qty(line: BomLine) {
  return line.unitLengthM ? `${line.count} × ${fmtM(line.unitLengthM)}` : `${line.count} st`
}

/**
 * Bill-of-materials overlay shown along the bottom of the 3D view: the running
 * metres of wood (poles + edge beams) with their cross-sections, plus the
 * sokkels with their footprint.
 */
export function BomFooter({ elements }: BomFooterProps) {
  const bom = useMemo(() => computeBom(elements), [elements])

  if (bom.wood.length === 0 && bom.sokkels.length === 0) {
    return null
  }

  return (
    <div className="floating-panel bom-footer" aria-label="Materiaalstaat">
      {bom.wood.length > 0 && (
        <div className="bom-group">
          <span className="bom-group-title">Hout</span>
          {bom.wood.map((line) => (
            <div key={line.key} className="bom-line">
              <span className="bom-line-label">{line.label}</span>
              <span className="bom-line-material">{line.material}</span>
              <span className="bom-line-section">{line.section}</span>
              <span className="bom-line-qty">{qty(line)}</span>
              <span className="bom-line-total">{fmtM(line.totalLengthM)}</span>
            </div>
          ))}
          <div className="bom-total">
            <span>Totaal hout</span>
            <strong>{fmtM(bom.totalWoodMeters)}</strong>
          </div>
        </div>
      )}

      {bom.sokkels.length > 0 && (
        <div className="bom-group">
          <span className="bom-group-title">Sokkels</span>
          {bom.sokkels.map((line) => (
            <div key={line.key} className="bom-line">
              <span className="bom-line-label">{line.label}</span>
              <span className="bom-line-material">{line.material}</span>
              <span className="bom-line-section">{line.section}</span>
              <span className="bom-line-qty">{line.count} st</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
