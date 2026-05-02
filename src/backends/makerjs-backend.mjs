import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const makerjs = require('makerjs');

const DEFAULT_CELL_SIZE = 60;

function degToRad(d) {
  return (d * Math.PI) / 180;
}

function roundPoint(point) {
  return [Number(point[0].toFixed(3)), Number(point[1].toFixed(3))];
}

function regularPolygon(cx, cy, radius, sides, rotationDeg = 0) {
  const points = [];
  const rot = degToRad(rotationDeg);
  for (let i = 0; i < sides; i++) {
    const angle = rot + (2 * Math.PI * i) / sides - Math.PI / 2;
    points.push(roundPoint([
      cx + radius * Math.cos(angle),
      cy + radius * Math.sin(angle),
    ]));
  }
  return points;
}

function starPolygon(cx, cy, outerRadius, innerRadius, sides, deltaRad = 0) {
  const points = [];
  const step = Math.PI / sides;
  for (let i = 0; i < sides * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angleOffset = i % 2 === 0 ? 0 : deltaRad;
    const angle = i * step - Math.PI / 2 + angleOffset;
    points.push(roundPoint([
      cx + r * Math.cos(angle),
      cy + r * Math.sin(angle),
    ]));
  }
  return points;
}

function connectClosed(points) {
  const paths = {};
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length;
    paths[`edge-${String(i).padStart(2, '0')}`] = new makerjs.paths.Line(points[i], points[next]);
  }
  return { paths };
}

function tileSides(tileType) {
  const map = { hexagon: 6, octagon: 8, square: 4, pentagon: 5, decagon: 10 };
  return map[tileType] || 6;
}

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
      tiles.push({
        cx: col * spacing + size,
        cy: row * spacing + size,
        tileType,
        radius: size,
      });
    }
  }
  return tiles;
}

function semiRegular482(cols, rows, size) {
  const tiles = [];
  const octSpacing = size * 2.6;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({
        cx: col * octSpacing + size * 1.3,
        cy: row * octSpacing + size * 1.3,
        tileType: 'octagon',
        radius: size,
      });
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols - 1; col++) {
      tiles.push({
        cx: col * octSpacing + octSpacing * 0.5 + size * 1.3,
        cy: row * octSpacing + size * 1.3,
        tileType: 'square',
        radius: size * 0.55,
      });
    }
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({
        cx: col * octSpacing + size * 1.3,
        cy: row * octSpacing + octSpacing * 0.5 + size * 1.3,
        tileType: 'square',
        radius: size * 0.55,
      });
    }
  }
  return tiles;
}

function staggeredGrid(cols, rows, size, tileType) {
  const tiles = [];
  const spacing = size * 2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({
        cx: col * spacing + size + (row % 2 === 1 ? size : 0),
        cy: row * spacing * 0.866 + size,
        tileType,
        radius: size,
      });
    }
  }
  return tiles;
}

function semiRegular10610(cols, rows, size) {
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
      tiles.push({
        cx: cx + ring.r * Math.cos(angle),
        cy: cy + ring.r * Math.sin(angle),
        tileType: ring.id,
        radius: cellSize * 0.35,
      });
    }
  }
  return tiles;
}

function motifToModel(tile, motifEntry) {
  const { cx, cy, radius, tileType } = tile;
  const { family, variant, parameters = {} } = motifEntry;

  if (family === 'star') {
    const sides = parameters.points || tileSides(tileType);
    let outerR, innerR;
    if (parameters.outerRadius != null) {
      outerR = parameters.outerRadius;
      innerR = parameters.innerRadius != null ? parameters.innerRadius : outerR * 0.5;
    } else {
      const skip = parameters.skip ?? 1.5;
      const scale = parameters.scale ?? 1.0;
      outerR = radius * 0.88 * scale;
      innerR = outerR * Math.max(0.05, 1 - skip / sides);
    }
    const delta = parameters.delta ?? 0;
    return connectClosed(starPolygon(cx, cy, outerR, innerR, sides, delta * (Math.PI / sides)));
  }

  if (family === 'polygon') {
    const sides = parameters.sides || 4;
    const rotation = parameters.rotation || 0;
    const scale = parameters.scale ?? 1.0;
    return connectClosed(regularPolygon(cx, cy, radius * 0.88 * scale, sides, rotation));
  }

  if (family === 'rosette') {
    const sides = parameters.sides || 6;
    const depth = parameters.depth || 2;
    const scale = parameters.scale ?? 1.0;
    const models = {};
    for (let d = 0; d < depth; d++) {
      const r = radius * 0.88 * scale * (1 - d * 0.22);
      const rot = d % 2 === 0 ? 0 : 180 / sides;
      models[`ring-${String(d).padStart(2, '0')}`] = connectClosed(regularPolygon(cx, cy, r, sides, rot));
    }
    return { models };
  }

  if (family === 'simple') {
    if (variant === 'diagonal-beam') {
      const beamWidth = parameters.beamWidth || 12;
      const angle = parameters.angle || 45;
      const rad = degToRad(angle);
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      const hw = beamWidth / 2;
      const halfLen = radius * 1.2;
      return connectClosed([
        roundPoint([cx - halfLen * cosA - hw * sinA, cy - halfLen * sinA + hw * cosA]),
        roundPoint([cx + halfLen * cosA - hw * sinA, cy + halfLen * sinA + hw * cosA]),
        roundPoint([cx + halfLen * cosA + hw * sinA, cy + halfLen * sinA - hw * cosA]),
        roundPoint([cx - halfLen * cosA + hw * sinA, cy - halfLen * sinA - hw * cosA]),
      ]);
    }
    const diameter = parameters.holeDiameter || radius * 1.2;
    return {
      paths: {
        circle: new makerjs.paths.Circle(roundPoint([cx, cy]), Number((diameter / 2).toFixed(3))),
      },
    };
  }

  if (family === 'custom' && variant === 'parallel-lines') {
    return parallelLineSystem(cx, cy, radius, motifEntry.count || 20, parameters);
  }

  const r = radius * 0.6;
  return connectClosed(regularPolygon(cx, cy, r, 4, 45));
}

function parallelLineSystem(cx, cy, radius, count, params) {
  const spacing = params.spacing || 12;
  const angle = degToRad(params.angle || 0);
  const length = radius * 2.2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  const paths = {};

  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * spacing;
    const mx = cx + nx * offset;
    const my = cy + ny * offset;
    paths[`line-${String(i).padStart(2, '0')}`] = new makerjs.paths.Line(
      roundPoint([mx - dx * length / 2, my - dy * length / 2]),
      roundPoint([mx + dx * length / 2, my + dy * length / 2])
    );
  }

  return { paths };
}

function addModel(root, id, model) {
  if (!root.models) root.models = {};
  root.models[id] = model;
}

/**
 * Build a raw Maker.js model from IR (before serialization/export).
 * Shared by all Maker.js backend adapters.
 *
 * @returns {{ root: object, tiles: Array, emitted: number }}
 */
function buildMakerJsModel(ir, options = {}) {
  const cellSize = options.cellSize || DEFAULT_CELL_SIZE;
  const tiling = ir.geometry?.tiling || {};
  const grid = tiling.grid || {};
  const tiles = computeTilePositions(tiling, grid, cellSize);
  const motifs = ir.geometry?.motifs || [];
  const root = {
    units: makerjs.unitType.Millimeter,
    models: {},
  };

  let emitted = 0;
  if (tiling.type === 'none') {
    for (const [index, motifEntry] of motifs.entries()) {
      addModel(
        root,
        `freeform-${String(index).padStart(2, '0')}`,
        motifToModel({ cx: 200, cy: 200, tileType: motifEntry.tileType, radius: 160 }, motifEntry)
      );
      emitted++;
    }
  } else {
    for (const [index, tile] of tiles.entries()) {
      const motifEntry = motifs.find((m) => m.tileType === tile.tileType);
      if (!motifEntry) continue;
      addModel(root, `motif-${String(index).padStart(4, '0')}`, motifToModel(tile, motifEntry));
      emitted++;
    }
  }

  return { root, tiles, emitted, tiling, renderMode: ir.style?.renderMode || 'line' };
}

function baseMeta(tiling, tiles, emitted, renderMode) {
  return {
    backend: 'makerjs',
    units: makerjs.unitType.Millimeter,
    tileCount: tiles.length,
    motifCount: emitted,
    tiling: tiling.id || tiling.type || 'unknown',
    renderMode,
  };
}

/**
 * Maker.js JSON backend — returns a serializable Maker.js model object.
 */
export function compileMakerJsJson(ir, options = {}) {
  const { root, tiles, emitted, tiling, renderMode } = buildMakerJsModel(ir, options);
  const model = JSON.parse(makerjs.exporter.toJson(root));
  return {
    model,
    meta: { ...baseMeta(tiling, tiles, emitted, renderMode), format: 'makerjs-json' },
  };
}

/**
 * Maker.js SVG export backend — uses Maker.js's built-in SVG exporter
 * to render the model as an SVG string.
 */
export function compileMakerJsSvg(ir, options = {}) {
  const { root, tiles, emitted, tiling, renderMode } = buildMakerJsModel(ir, options);
  const svg = makerjs.exporter.toSVG(root);
  return {
    svg,
    meta: { ...baseMeta(tiling, tiles, emitted, renderMode), format: 'makerjs-svg' },
  };
}

/**
 * Maker.js DXF export backend — uses Maker.js's built-in DXF exporter
 * to render the model as a DXF (R12) string.
 */
export function compileMakerJsDxf(ir, options = {}) {
  const { root, tiles, emitted, tiling, renderMode } = buildMakerJsModel(ir, options);
  const dxf = makerjs.exporter.toDXF(root);
  return {
    dxf,
    meta: { ...baseMeta(tiling, tiles, emitted, renderMode), format: 'makerjs-dxf' },
  };
}
