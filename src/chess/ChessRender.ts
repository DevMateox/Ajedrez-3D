/**
 * Renderizador 3D del tablero y las piezas de ajedrez.
 * Genera la escena, la cámara, los controles y anima los movimientos.
 */
import * as THREE from "three";
import { gsap } from "gsap";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { makePieceObject, PIECE_FLOOR_Y } from "@/pieces/factory";

export type PieceColor = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export interface PieceData {
  type: PieceType;
  color: PieceColor;
  square: string;
}

/**
 * Archivos del tablero necesarios para convertir una casilla en coordenadas.
 */
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

/**
 * Convierte una notación de casilla FEN como "e4" a coordenadas X/Z.
 */
function squareToPos(square: string): { x: number; z: number } {
  const file = FILES.indexOf(square[0]);
  const rank = Number.parseInt(square[1], 10) - 1;
  return { x: file - 3.5, z: 3.5 - rank };
}

export class ChessRenderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  /** Mapa de piezas colocadas actualmente en la escena, clave = casilla FEN. */
  readonly pieces = new Map<string, THREE.Object3D>();
  readonly container: HTMLElement;
  readonly resizeObs: ResizeObserver;
  private rafId = 0;
  private positionGeneration = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0f14);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 10, 10);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 20;

    this.setupLights();
    this.buildBoard();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);

    this.resize();
    this.animate();
  }

  /**
   * Configura la iluminación ambiente, direccional y de acento en la escena.
   */
  private setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));

    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(5, 10, 5);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.bias = -0.001;
    dir.shadow.camera.left = -8;
    dir.shadow.camera.right = 8;
    dir.shadow.camera.top = 8;
    dir.shadow.camera.bottom = -8;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 30;
    dir.target.position.set(0, 0, 0);
    this.scene.add(dir);
    this.scene.add(dir.target);

    const rim = new THREE.PointLight(0x6a8cff, 0.6, 30);
    rim.position.set(-5, 4, -5);
    this.scene.add(rim);
  }

  /**
   * Construye el tablero de ajedrez 3D con casillas claras y oscuras.
   */
  private buildBoard() {
    const boardGroup = new THREE.Group();

    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const isLight = (f + r) % 2 === 0;

        const mat = new THREE.MeshStandardMaterial({
          color: isLight ? 0xe9d8b3 : 0x6b4a2b,
          roughness: 0.6,
          metalness: 0.1,
        });

        const sq = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 1), mat);

        sq.position.set(f - 3.5, -0.1, 3.5 - r);
        sq.receiveShadow = true;

        boardGroup.add(sq);
      }
    }

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(9, 0.3, 9),
      new THREE.MeshStandardMaterial({
        color: 0x2a1810,
        roughness: 0.4,
      }),
    );

    frame.position.y = -0.16;
    boardGroup.add(frame);

    this.scene.add(boardGroup);
  }

  /**
   * Crea un objeto 3D de pieza a partir del tipo y color solicitados.
   */
  private async makePieceMesh(type: PieceType, color: PieceColor) {
    const obj = await makePieceObject(type, color);

    obj.userData = obj.userData || {};
    obj.userData.color = color;

    return obj;
  }

  /**
   * Coloca todas las piezas en la escena según la lista de posiciones actual.
   */
  async setPosition(pieces: PieceData[]) {
    const gen = ++this.positionGeneration;

    this.pieces.forEach((m) => this.scene.remove(m));
    this.pieces.clear();

    for (const p of pieces) {
      const mesh = await this.makePieceMesh(p.type, p.color);
      if (gen !== this.positionGeneration) return;

      const { x, z } = squareToPos(p.square);

      mesh.position.set(x, PIECE_FLOOR_Y, z);

      this.scene.add(mesh);
      this.pieces.set(p.square, mesh);
    }
  }

  /**
   * Anima el movimiento de una pieza de una casilla a otra.
   * También maneja capturas y promociones cuando sea necesario.
   */
  async animateMove(
    from: string,
    to: string,
    promotion?: PieceType,
    capturedColor?: PieceColor,
  ) {
    const mesh = this.pieces.get(from);
    if (!mesh) return;

    const target = squareToPos(to);

    const captured = this.pieces.get(to);
    if (captured) {
      gsap.to(captured.position, { y: -2, duration: 0.4 });
      gsap.to(captured.scale, {
        x: 0,
        y: 0,
        z: 0,
        duration: 0.4,
        onComplete: () => this.scene.remove(captured),
      });
    }

    this.pieces.delete(from);

    await new Promise<void>((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve });

      tl.to(mesh.position, { y: 1.2, duration: 0.25 });
      tl.to(mesh.position, {
        x: target.x,
        z: target.z,
        duration: 0.45,
      });
      tl.to(mesh.position, {
        y: PIECE_FLOOR_Y,
        duration: 0.2,
      });
    });

    if (promotion) {
      const color =
        (mesh.userData.color as PieceColor) || (capturedColor ?? "w");

      this.scene.remove(mesh);

      const newMesh = await this.makePieceMesh(promotion, color);
      newMesh.position.set(target.x, PIECE_FLOOR_Y, target.z);

      this.scene.add(newMesh);
      this.pieces.set(to, newMesh);
    } else {
      this.pieces.set(to, mesh);
    }
  }

  readonly animate = () => {
    this.rafId = requestAnimationFrame(this.animate);

    this.controls.update();

    this.renderer.render(this.scene, this.camera);
  };

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    this.resizeObs.disconnect();
    this.renderer.dispose();

    this.controls.dispose();

    this.renderer.domElement.remove();
  }
}
