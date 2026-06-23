import * as THREE from "three";
import type { PieceColor, PieceType } from "@/chess/ChessRender";
import { GLTFLoader } from "three/examples/jsm/Addons.js";

/**
 * Fabrica de modelos 3D de piezas de ajedrez.
 * Carga los archivos GLB, normaliza la posición y aplica tintes por color.
 */
const loader = new GLTFLoader();

const FILES: Record<PieceType, string> = {
  p: "/pawn_chess.glb",
  n: "/knight_chess.glb",
  b: "/bishop_chess.glb",
  r: "/rook_chess.glb",
  q: "/queen_chess.glb",
  k: "/king_chess.glb",
};

/** Altura base donde se colocan las piezas sobre el tablero. */
export const PIECE_FLOOR_Y = 0.05;

/** Caché local de modelos cargados para evitar recargas redundantes. */
const cache = new Map<PieceType, THREE.Object3D>();

function applyPieceColor(mesh: THREE.Mesh, color: PieceColor): void {
  const tint = color === "w" ? 0xf0f0f0 : 0x1a1a1a;

  const tintMaterial = (mat: THREE.Material): THREE.Material => {
    const pieceMat = mat.clone();
    if (
      pieceMat instanceof THREE.MeshStandardMaterial ||
      pieceMat instanceof THREE.MeshPhysicalMaterial
    ) {
      pieceMat.color.set(tint);
      pieceMat.metalness = 0.2;
      pieceMat.roughness = 0.5;
    }
    return pieceMat;
  };

  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map(tintMaterial);
  } else if (mesh.material) {
    mesh.material = tintMaterial(mesh.material);
  }
}

/**
 * Normaliza un modelo 3D dentro de un grupo pivot.
 * Esto centra la pieza y ajusta su tamaño para que encaje en una casilla.
 */
function normalizePiece(
  gltfScene: THREE.Group,
  targetSize = 0.85,
): THREE.Group {
  const pivot = new THREE.Group();

  // 1. Calculamos los límites reales del modelo original
  const box = new THREE.Box3().setFromObject(gltfScene);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // 2. Metemos la escena original dentro de nuestro grupo pivot
  pivot.add(gltfScene);

  // 3. Centramos el modelo original con respecto al pivot (X y Z),
  // y hacemos que la base descanse exactamente en Y = 0
  gltfScene.position.set(-center.x, -box.min.y, -center.z);

  // 4. Escalamos el pivot completo para que mantenga las proporciones deseadas
  const footprint = Math.max(size.x, size.z);
  if (footprint > 0) {
    pivot.scale.setScalar(targetSize / footprint);
  }

  return pivot;
}

async function loadPiece(type: PieceType): Promise<THREE.Object3D> {
  const cached = cache.get(type);

  if (cached) {
    return cached;
  }

  return new Promise((resolve, reject) => {
    loader.load(
      FILES[type],
      (gltf) => {
        const model = gltf.scene;

        const normalizedPivot = normalizePiece(model);

        normalizedPivot.traverse((child: any) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        cache.set(type, normalizedPivot);
        resolve(normalizedPivot);
      },
      undefined,
      (err) => {
        console.error(`[factory] ${type}: ERROR cargando ${FILES[type]}`, err);
        reject(err);
      },
    );
  });
}

export async function makePieceObject(
  type: PieceType,
  color: PieceColor,
): Promise<THREE.Object3D> {
  const original = await loadPiece(type);

  // Clonamos profundamente el contenedor Pivot limpio de la caché
  const piece = original.clone(true);

  // Posicionamos el contenedor de forma limpia
  piece.position.set(0, PIECE_FLOOR_Y, 0);
  piece.rotation.set(0, 0, 0);

  piece.userData = {
    type,
    color,
  };

  piece.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      applyPieceColor(child, color);
    }
  });

  return piece;
}
