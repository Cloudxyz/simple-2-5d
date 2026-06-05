export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Part {
  id: string;
  name: string;
  /** Bounding region stored in image-local coordinates */
  bounds: BoundingBox;
  /** Pivot point for rotation/movement, in image-local coordinates */
  movementPoint: Point;
  /** Depth layer: higher number = in front */
  zIndex: number;
  parentId: string | null;
  /** Extracted PNG data URL for this part (set on export) */
  imageDataUrl: string | null;
  isVisible: boolean;
  /** Rotation around the movement point, in degrees */
  rotation: number;
  /** Polygon vertices in image-local coords. Null for rectangle-created parts.
   *  Polygon crop is future work — PNG export uses bounds as fallback. */
  polygonPoints?: Point[] | null;
}

export interface CharacterRig {
  name: string;
  imageDataUrl: string | null;
  parts: Part[];
}

export interface RigExport {
  version: 1;
  name: string;
  parts: Omit<Part, "imageDataUrl">[];
}
