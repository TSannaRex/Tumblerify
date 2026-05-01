// frustum.js — Tumbler wrap arc geometry
// ES module (Node + browser via <script type="module"> or globalThis fallback)

function _frustumFactory() {

  // Standard tumbler sizes (all measurements in mm)
  const SIZES = {
    '4oz':  { label: '4 oz',  topDia: 55,  botDia: 45,  height: 65  },
    '8oz':  { label: '8 oz',  topDia: 75,  botDia: 55,  height: 85  },
    '9oz':  { label: '9 oz',  topDia: 78,  botDia: 57,  height: 90  },
    '12oz': { label: '12 oz', topDia: 82,  botDia: 60,  height: 95  },
    '16oz': { label: '16 oz', topDia: 92,  botDia: 67,  height: 120 },
    '22oz': { label: '22 oz', topDia: 98,  botDia: 72,  height: 140 }
  };

  /**
   * Compute annular sector (arc) dimensions from frustum measurements.
   *
   * A truncated cone (frustum) unrolls to an annular sector:
   *   - slant height   l = sqrt(h² + ((R-r)/2)²)  where R=top radius, r=bot radius
   *   - outer radius   R2 = R * l / (R - r)        (from top of cup)
   *   - inner radius   R1 = R2 - l
   *   - sweep angle    θ  = 2π * R / R2  (radians)
   *
   * Returns object with all values in mm plus sweep in degrees.
   */
  function compute(sizeKey, overlapMm) {
    const s = SIZES[sizeKey];
    if (!s) throw new Error('Unknown size: ' + sizeKey);

    const overlap = overlapMm || 10;
    const R = s.topDia / 2;   // top radius
    const r = s.botDia / 2;   // bottom radius
    const h = s.height;

    // Slant height of the cone frustum
    const slant = Math.sqrt(h * h + Math.pow(R - r, 2));

    // Outer and inner radii of the annular sector
    const outerR = (R * slant) / (R - r);
    const innerR = outerR - slant;

    // Sweep angle in radians and degrees
    const sweepRad = (2 * Math.PI * R) / outerR;
    const sweepDeg = sweepRad * (180 / Math.PI);

    // Arc lengths
    const outerArc = outerR * sweepRad;  // = circumference of top
    const innerArc = innerR * sweepRad;  // = circumference of bottom

    return {
      sizeKey,
      label: s.label,
      topDia: s.topDia,
      botDia: s.botDia,
      height: s.height,
      slant,
      outerR,
      innerR,
      sweepRad,
      sweepDeg,
      outerArc,
      innerArc,
      overlapMm: overlap
    };
  }

  /**
   * Given computed arc params, return the SVG path data for the wrap shape.
   * The arc is centered on origin (0,0). Use a viewBox transform to position.
   * overlapMm adds an extra overlap tab on the right side.
   */
  function arcPath(params, scale) {
    const sc = scale || 1;
    const { outerR, innerR, sweepDeg, sweepRad, overlapMm } = params;

    const oR = outerR * sc;
    const iR = innerR * sc;

    // We draw the arc starting at -sweepDeg/2, ending at +sweepDeg/2 (centred)
    // Plus an overlap tab angle
    const overlapAngle = (overlapMm / outerR) * (180 / Math.PI);
    const halfSweep = sweepDeg / 2;
    const startDeg = -halfSweep;
    const endDeg   =  halfSweep + overlapAngle;

    function polar(r, deg) {
      const rad = deg * Math.PI / 180;
      return [r * Math.sin(rad), -r * Math.cos(rad)];
    }

    const [ox1, oy1] = polar(oR, startDeg);
    const [ox2, oy2] = polar(oR, endDeg);
    const [ix1, iy1] = polar(iR, endDeg);
    const [ix2, iy2] = polar(iR, startDeg);

    const largeArc = (endDeg - startDeg) > 180 ? 1 : 0;

    // Dashed overlap indicator line angle
    const overlapStartX = polar(oR, halfSweep)[0];
    const overlapStartY = polar(oR, halfSweep)[1];
    const overlapEndX   = polar(iR, halfSweep)[0];
    const overlapEndY   = polar(iR, halfSweep)[1];

    const d = [
      `M ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
      `A ${oR.toFixed(2)} ${oR.toFixed(2)} 0 ${largeArc} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)}`,
      `L ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
      `A ${iR.toFixed(2)} ${iR.toFixed(2)} 0 ${largeArc} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
      'Z'
    ].join(' ');

    const overlapLine = `M ${overlapStartX.toFixed(2)} ${overlapStartY.toFixed(2)} L ${overlapEndX.toFixed(2)} ${overlapEndY.toFixed(2)}`;

    return { d, overlapLine, startDeg, endDeg, halfSweep, overlapAngle };
  }

  /**
   * Return bounding box of the arc in mm (unscaled).
   * Used to size the canvas / SVG viewBox.
   */
  function boundingBox(params) {
    const { outerR, innerR, sweepDeg, overlapMm } = params;
    const overlapAngle = (overlapMm / outerR) * (180 / Math.PI);
    const halfSweep = sweepDeg / 2;

    // The arc is centered; widest point is outerR * sin(halfSweep + overlapAngle/2)
    const maxAngle = halfSweep + overlapAngle;
    const width  = outerR * (Math.sin(maxAngle * Math.PI / 180) + Math.sin(halfSweep * Math.PI / 180));
    const height = outerR - innerR * Math.cos(halfSweep * Math.PI / 180);

    // Add margin
    const margin = 10;
    return {
      width:  Math.ceil(width  + margin * 2),
      height: Math.ceil(height + margin * 2),
      cx: Math.ceil(outerR * Math.sin(halfSweep * Math.PI / 180) + margin),
      cy: margin
    };
  }

  return { SIZES, compute, arcPath, boundingBox };
}

const Frustum = _frustumFactory();

// Browser global (for non-module <script> tags)
if (typeof window !== 'undefined') window.Frustum = Frustum;

export default Frustum;
export const { SIZES, compute, arcPath, boundingBox } = Frustum;
