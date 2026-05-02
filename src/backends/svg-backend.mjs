/**
 * Minimal SVG Backend for Pattern Geometry IR
 *
 * Interprets the semantic IR and produces deterministic SVG output.
 * This backend owns low-level geometry decisions (vertex positions,
 * tile placement, shape construction) while the IR owns semantics.
 *
 * Backend contract:
 *   compile(ir, options) → { svg: string, meta: { width, height, ... } }
 *
 * Supported tilings: 6.6.6, 4.4.4.4, 4.8.2, diagonal-grid, radial
 * Supported motif families: star, polygon, rosette, simple
 */

// ---- Geometry helpers ----

function degToRad(d) {
  return (d * Math.PI) / 180;
}

/**
 * Generate points of a regular polygon.
 */
function regularPolygon(cx, cy, radius, sides, rotationDeg = 0) {
  const points = [];
  const rot = degToRad(rotationDeg);
  for (let i = 0; i < sides; i++) {
    const angle = rot + (2 * Math.PI * i) / sides - Math.PI / 2;
    points.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  return points;
}

/**
 * Generate points of a star polygon.
 * outerRadius: circumradius for outer points
 * innerRadius: radius for inner (re-entrant) points
 * sides: number of points
 * delta: optional phase offset for inner points (in radians)
 */
function starPolygon(cx, cy, outerRadius, innerRadius, sides, deltaRad = 0) {
  const points = [];
  const step = Math.PI / sides;
  for (let i = 0; i < sides * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angleOffset = i % 2 === 0 ? 0 : deltaRad;
    const angle = i * step - Math.PI / 2 + angleOffset;
    points.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }
  return points;
}

function pointsToSvgPath(points) {
  if (points.length === 0) return '';
  const parts = points.map((p, i) => {
    const cmd = i === 0 ? 'M' : 'L';
    return `${cmd}${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  });
  return parts.join(' ') + ' Z';
}

// ---- Tile layout engines ----

const DEFAULT_CELL_SIZE = 60;

/**
 * Compute tile positions for a given tiling and grid.
 * Returns Array<{ cx, cy, tileType, radius }>
 */
function computeTilePositions(tiling, grid, cellSize = DEFAULT_CELL_SIZE) {
  const cols = grid?.columns || 3;
  const rows = grid?.rows || 3;
  const type = tiling.type;
  const id = tiling.id;

  if (type === 'regular' && id === '6.6.6') {
    return hexGrid(cols, rows, cellSize, 'hexagon');
  }
  if (type === 'regular' && id === '4.4.4.4') {
    return squareGrid(cols, rows, cellSize, 'square');
  }
  if (type === 'semi-regular' && id === '4.8.2') {
    return semiRegular482(cols, rows, cellSize);
  }
  if (type === 'custom' && id === 'diagonal-grid') {
    return staggeredGrid(cols, rows, cellSize, 'perforation-cell');
  }
  if (type === 'semi-regular' && id === '10.6.10.6') {
    return semiRegular10610(cols, rows, cellSize);
  }
  if (type === 'lattice') {
    return latticeLayout(cols, rows, cellSize);
  }
  if (type === 'radial') {
    return radialLayout(tiling.radius || 200, cellSize);
  }
  if (type === 'none') {
    return [{ cx: 200, cy: 200, tileType: '__freeform__', radius: 160 }];
  }

  // fallback: plain square grid
  return squareGrid(cols, rows, cellSize, 'cell');
}

function hexGrid(cols, rows, size, tileType) {
  const tiles = [];
  const w = size * 2;
  const h = size * Math.sqrt(3);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * w + (row % 2 === 1 ? size : 0) + size;
      const cy = row * h * 0.75 + h / 2;
      tiles.push({ cx, cy, tileType, radius: size });
    }
  }
  return tiles;
}

function squareGrid(cols, rows, size, tileType) {
  const tiles = [];
  const spacing = size * 2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * spacing + size;
      const cy = row * spacing + size;
      tiles.push({ cx, cy, tileType, radius: size });
    }
  }
  return tiles;
}

function semiRegular482(cols, rows, size) {
  // 4.8.2: octagons at grid positions, squares fill gaps
  const tiles = [];
  const octSpacing = size * 2.6;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * octSpacing + size * 1.3;
      const cy = row * octSpacing + size * 1.3;
      tiles.push({ cx, cy, tileType: 'octagon', radius: size });
    }
  }
  // squares at midpoints between adjacent octagons (horizontal and vertical)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const cx = col * octSpacing + octSpacing * 0.5 + size * 1.3;
      const cy = row * octSpacing + size * 1.3;
      tiles.push({ cx, cy, tileType: 'square', radius: size * 0.55 });
    }
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * octSpacing + size * 1.3;
      const cy = row * octSpacing + octSpacing * 0.5 + size * 1.3;
      tiles.push({ cx, cy, tileType: 'square', radius: size * 0.55 });
    }
  }
  return tiles;
}

function staggeredGrid(cols, rows, size, tileType) {
  const tiles = [];
  const spacing = size * 2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * spacing + size + (row % 2 === 1 ? size : 0);
      const cy = row * spacing * 0.866 + size;
      tiles.push({ cx, cy, tileType, radius: size });
    }
  }
  return tiles;
}

function semiRegular10610(cols, rows, size) {
  // 10.6.10.6 is hyperbolic — not a valid Euclidean tiling.
  // Provide an artistic approximation: decagons and hexagons on a
  // staggered checkerboard so example 03-decagon-hexagon-line emits
  // real star geometry instead of empty fallback.
  const tiles = [];
  const w = size * 2.5;
  const h = w * Math.sqrt(3) / 2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * w + (row % 2 === 1 ? w / 2 : 0) + size;
      const cy = row * h * 0.75 + size;
      const tileType = (row + col) % 2 === 0 ? 'decagon' : 'hexagon';
      tiles.push({ cx, cy, tileType, radius: size });
    }
  }
  return tiles;
}

function latticeLayout(cols, rows, size) {
  // Staggered grid with alternating structural-rib, infill-cell-a,
  // infill-cell-b so every motif template in the IR maps to a tile.
  const tiles = [];
  const spacing = size * 2;
  const tileTypes = ['structural-rib', 'infill-cell-a', 'infill-cell-b'];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * spacing + size + (row % 2 === 1 ? size : 0);
      const cy = row * spacing * 0.866 + size;
      const typeIdx = (col + row * 2) % tileTypes.length;
      tiles.push({ cx, cy, tileType: tileTypes[typeIdx], radius: size });
    }
  }
  return tiles;
}

function radialLayout(totalRadius, cellSize) {
  // Concentric rings: interpret ring-N tile types from motifs
  // The motifs define ring-0, ring-1, ring-2 with counts
  // Return tiles grouped by ring for motif assignment
  const tiles = [];
  const rings = [
    { id: 'ring-0', r: 0, count: 1 },
    { id: 'ring-1', r: cellSize * 1.8, count: 8 },
    { id: 'ring-2', r: cellSize * 3.6, count: 16 },
  ];
  for (const ring of rings) {
    if (ring.r > totalRadius * 0.8) continue;
    const cx = totalRadius;
    const cy = totalRadius;
    for (let i = 0; i < ring.count; i++) {
      const angle = (2 * Math.PI * i) / ring.count - Math.PI / 2;
      const tx = cx + ring.r * Math.cos(angle);
      const ty = cy + ring.r * Math.sin(angle);
      tiles.push({
        cx: tx,
        cy: ty,
        tileType: ring.id,
        radius: cellSize * 0.35,
        ringIndex: rings.indexOf(ring),
      });
    }
  }
  return tiles;
}

// ---- Motif renderers ----

/**
 * Render a single motif on a tile.
 * Returns SVG element string(s).
 */
function renderMotif(tile, motifEntry, style) {
  const { cx, cy, radius } = tile;
  const { family, variant, parameters = {} } = motifEntry;

  switch (family) {
    case 'star':
      return renderStar(cx, cy, radius, tile.tileType, parameters, style);
    case 'polygon':
      return renderPolygon(cx, cy, radius, parameters, style);
    case 'rosette':
      return renderRosette(cx, cy, radius, parameters, style);
    case 'simple':
      return renderSimple(cx, cy, radius, { ...parameters, variant }, style);
    case 'custom':
      return renderCustom(cx, cy, radius, { ...parameters, variant: motifEntry.variant, count: motifEntry.count }, style);
    default:
      return '';
  }
}

function tileSides(tileType) {
  const map = { hexagon: 6, octagon: 8, square: 4, pentagon: 5, decagon: 10 };
  return map[tileType] || 6;
}

function renderStar(cx, cy, radius, tileType, params, style) {
  const sides = params.points || tileSides(tileType);
  let outerR, innerR;
  if (params.outerRadius != null) {
    outerR = params.outerRadius;
    innerR = params.innerRadius != null ? params.innerRadius : outerR * 0.5;
  } else {
    const skip = params.skip ?? 1.5;
    const scale = params.scale ?? 1.0;
    outerR = radius * 0.88 * scale;
    // Larger skip → deeper star (smaller inner radius)
    const innerRatio = Math.max(0.05, 1 - skip / sides);
    innerR = outerR * innerRatio;
  }
  const delta = params.delta ?? 0;
  const deltaRad = delta * (Math.PI / sides);

  const points = starPolygon(cx, cy, outerR, innerR, sides, deltaRad);
  const pathData = pointsToSvgPath(points);

  const strokeColor = style?.stroke?.color || '#1a1a2e';
  const strokeWidth = style?.stroke?.width || 1.5;
  const strokeOpacity = style?.stroke?.opacity ?? 1;
  const fillColor = style?.fill?.color || 'none';
  const fillOpacity = style?.fill?.opacity ?? 1;

  return `<path d="${pathData}" fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}" stroke-linejoin="round"/>`;
}

function renderPolygon(cx, cy, radius, params, style) {
  const sides = params.sides || 4;
  const rotation = params.rotation || 0;
  const scale = params.scale ?? 1.0;
  const r = radius * 0.88 * scale;

  const points = regularPolygon(cx, cy, r, sides, rotation);
  const pathData = pointsToSvgPath(points);

  const strokeColor = style?.stroke?.color || '#e94560';
  const strokeWidth = style?.stroke?.width || 1.5;
  const strokeOpacity = style?.stroke?.opacity ?? 1;
  const fillColor = style?.fill?.color || 'none';
  const fillOpacity = style?.fill?.opacity ?? 1;

  return `<path d="${pathData}" fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}" stroke-linejoin="round"/>`;
}

function renderRosette(cx, cy, radius, params, style) {
  const sides = params.sides || 6;
  const depth = params.depth || 2;
  const scale = params.scale ?? 1.0;
  const parts = [];

  const strokeColor = style?.stroke?.color || '#1a1a2e';
  const strokeWidth = style?.stroke?.width || 1.2;
  const strokeOpacity = style?.stroke?.opacity ?? 1;

  for (let d = 0; d < depth; d++) {
    const r = radius * 0.88 * scale * (1 - d * 0.22);
    const rot = d % 2 === 0 ? 0 : 180 / sides;
    const points = regularPolygon(cx, cy, r, sides, rot);
    const pathData = pointsToSvgPath(points);
    parts.push(
      `<path d="${pathData}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * (1 - d * 0.2)}" stroke-opacity="${strokeOpacity}" stroke-linejoin="round"/>`
    );
  }
  return parts.join('\n');
}

function renderSimple(cx, cy, radius, params, style) {
  const variant = params.variant || 'circle-hole';
  const strokeColor = style?.stroke?.color || '#000000';
  const strokeWidth = style?.stroke?.width || 0.5;
  const strokeOpacity = style?.stroke?.opacity ?? 1;
  const fillColor = style?.fill?.color || '#ffffff';
  const fillOpacity = style?.fill?.opacity ?? 1;

  switch (variant) {
    case 'circle-hole': {
      const holeDiameter = params.holeDiameter || 8;
      const r = holeDiameter / 2;
      return `<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${r.toFixed(3)}" fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}"/>`;
    }
    case 'diagonal-beam': {
      const beamWidth = params.beamWidth || 12;
      const angle = params.angle || 45;
      const rad = degToRad(angle);
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      const hw = beamWidth / 2;
      const halfLen = radius * 1.2;
      const points = [
        { x: cx - halfLen * cosA - hw * sinA, y: cy - halfLen * sinA + hw * cosA },
        { x: cx + halfLen * cosA - hw * sinA, y: cy + halfLen * sinA + hw * cosA },
        { x: cx + halfLen * cosA + hw * sinA, y: cy + halfLen * sinA - hw * cosA },
        { x: cx - halfLen * cosA + hw * sinA, y: cy - halfLen * sinA - hw * cosA },
      ];
      return `<path d="${pointsToSvgPath(points)}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}" stroke-linejoin="round"/>`;
    }
    default: {
      const r = radius * 0.7;
      return `<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${r.toFixed(3)}" fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}"/>`;
    }
  }
}

function renderCustom(cx, cy, radius, params, style) {
  if (params.variant === 'parallel-lines') {
    return renderParallelLines(cx, cy, radius, params, style);
  }
  // Custom: render as a simple diamond marker
  const r = radius * 0.6;
  const points = regularPolygon(cx, cy, r, 4, 45);
  const pathData = pointsToSvgPath(points);
  const strokeColor = style?.stroke?.color || '#999';
  const strokeWidth = style?.stroke?.width || 1;
  return `<path d="${pathData}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="4,3"/>`;
}

function renderParallelLines(cx, cy, radius, params, style) {
  const count = params.count || 20;
  const spacing = params.spacing || 12;
  const angle = degToRad(params.angle || 0);
  const length = radius * 2.2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;

  const strokeColor = style?.stroke?.color || '#222831';
  const strokeWidth = style?.stroke?.width || 1;
  const strokeOpacity = style?.stroke?.opacity ?? 1;

  const parts = [];
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * spacing;
    const mx = cx + nx * offset;
    const my = cy + ny * offset;
    parts.push(
      `<line x1="${(mx - dx * length / 2).toFixed(3)}" y1="${(my - dy * length / 2).toFixed(3)}" x2="${(mx + dx * length / 2).toFixed(3)}" y2="${(my + dy * length / 2).toFixed(3)}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}"/>`
    );
  }
  return parts.join('\n');
}

// ---- SVG document builder ----

function computeSvgBounds(tiles) {
  if (tiles.length === 0) return { width: 400, height: 400, pad: 40 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of tiles) {
    if (t.cx - t.radius < minX) minX = t.cx - t.radius;
    if (t.cy - t.radius < minY) minY = t.cy - t.radius;
    if (t.cx + t.radius > maxX) maxX = t.cx + t.radius;
    if (t.cy + t.radius > maxY) maxY = t.cy + t.radius;
  }
  const pad = 30;
  return {
    width: Math.ceil(maxX - minX + pad * 2),
    height: Math.ceil(maxY - minY + pad * 2),
    pad,
    offsetX: minX - pad,
    offsetY: minY - pad,
  };
}

/**
 * Build an SVG document string from tile positions and motif rendering.
 */
function buildSvgDoc(tiles, ir, bounds) {
  const { width, height, offsetX, offsetY } = bounds;
  const style = ir.style || {};
  const bgColor = style.fill?.color === '#ffffff' ? '#000000' : '#ffffff';
  const tiling = ir.geometry?.tiling || {};

  const groupTransform = `translate(${-offsetX},${-offsetY})`;

  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`
  );
  parts.push(`  <rect width="${width}" height="${height}" fill="${bgColor}"/>`);
  parts.push(`  <g transform="${groupTransform}">`);

  const motifs = ir.geometry?.motifs || [];

  if (tiling.type === 'none') {
    // Freeform: render all motifs at center, matching Maker.js backend behavior
    const freeformTile = tiles[0];
    for (const motifEntry of motifs) {
      const svg = renderMotif(freeformTile, motifEntry, style);
      if (svg) parts.push(`    ${svg}`);
    }
  } else {
    for (const tile of tiles) {
      const motifEntry = motifs.find((m) => m.tileType === tile.tileType);
      if (!motifEntry) continue;
      const svg = renderMotif(tile, motifEntry, style);
      if (svg) parts.push(`    ${svg}`);
    }
  }

  parts.push(`  </g>`);
  parts.push(`</svg>`);

  return parts.join('\n') + '\n';
}

// ---- Compile entry point ----

const SUPPORTED_TILINGS = ['6.6.6', '4.4.4.4', '4.8.2', '10.6.10.6', 'diagonal-grid', 'diagonal-lattice'];

/**
 * Compile a validated IR into an SVG string.
 *
 * @param {object} ir - Validated PG-IR object
 * @param {object} options - { cellSize?: number }
 * @returns {{ svg: string, meta: { width: number, height: number, tileCount: number, tiling: string, renderMode: string } }}
 */
export function compileSvg(ir, options = {}) {
  const cellSize = options.cellSize || DEFAULT_CELL_SIZE;
  const tiling = ir.geometry?.tiling || {};
  const grid = tiling.grid || {};

  const tiles = computeTilePositions(tiling, grid, cellSize);
  const bounds = computeSvgBounds(tiles);
  const svg = buildSvgDoc(tiles, ir, bounds);

  return {
    svg,
    meta: {
      width: bounds.width,
      height: bounds.height,
      tileCount: tiles.length,
      tiling: tiling.id || tiling.type || 'unknown',
      renderMode: ir.style?.renderMode || 'line',
    },
  };
}

export { SUPPORTED_TILINGS };
