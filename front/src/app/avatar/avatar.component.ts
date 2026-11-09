import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  Input,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import type * as Three from 'three';
import { Subscription } from 'rxjs';
import { AvatarService } from '../services/avatar.service';

let THREE: typeof import('three');

interface EyeParts {
  ball: Three.Group;
  upperLid: Three.Mesh;
  lowerLid: Three.Mesh;
  pupil: Three.Mesh;
  side: number;
}

type EmotionName = 'neutral' | 'feliz' | 'triste' | 'enfadado' | 'sorpresa' | 'miedo';

interface Expression {
  brow: number;
  tilt: number;
  eye: number;
  smile: number;
  cheek: number;
  mouthOpen: number;
}

interface EmotionResult {
  emotion: EmotionName;
  intensity: number;
}

const EXPRESSIONS: Record<EmotionName, Expression> = {
  neutral: { brow: 0, tilt: 0, eye: 0.86, smile: 0.12, cheek: 0, mouthOpen: 0 },
  feliz: { brow: 0.35, tilt: -0.1, eye: 0.95, smile: 1, cheek: 0.7, mouthOpen: 0.4 },
  triste: { brow: 0.1, tilt: -0.9, eye: 0.62, smile: -0.85, cheek: 0, mouthOpen: 0 },
  enfadado: { brow: -0.45, tilt: 0.95, eye: 0.78, smile: -0.55, cheek: 0, mouthOpen: 0 },
  sorpresa: { brow: 1, tilt: 0, eye: 1, smile: 0, cheek: 0, mouthOpen: 0.5 },
  miedo: { brow: 0.7, tilt: -0.8, eye: 1, smile: -0.4, cheek: 0, mouthOpen: 0.15 },
};

const EMOTION_WORDS: Record<Exclude<EmotionName, 'neutral'>, [string, string]> = {
  feliz: [
    'happy glad nice good great fun funny cool lucky pleased cheer* smil* laugh* enjoy* kind sweet beautiful lovely perfect bright win won hope* proud welcome thanks thank',
    'love* wonderful amazing awesome fantastic delighted thrilled excited joy* brilliant excellent superb celebrat* yay hooray',
  ],
  triste: [
    'sad sorry miss* alone lonely cry* tears lost lose loss hurt pain* gone empty tired sigh unhappy poor regret* grief disappoint* bad worse worst awful',
    'heartbroken devastat* depress* miserable mourn* funeral tragic* hopeless terrible horrible',
  ],
  enfadado: [
    'angry mad annoy* upset rude stupid idiot* wrong blame* fight* shout* yell* ugly enough liar disgust*',
    'furious rage* hate* hell damn* outrag* livid',
  ],
  miedo: [
    'afraid scared fear* worr* nervous anxious danger* threat* panic* creep* shake shaking dark',
    'terrified horror* nightmare* scream* dread*',
  ],
  sorpresa: [
    'wow whoa suddenly sudden unexpected surpris* strange weird',
    'incredible unbelievable shocking shocked astonish* amazed omg',
  ],
};

const EMOTION_LEXICON = Object.entries(EMOTION_WORDS).flatMap(([emotion, weights]) =>
  weights.flatMap((words, index) =>
    words.split(' ').map((word) => ({
      word: word.replace('*', ''),
      prefix: word.endsWith('*'),
      emotion: emotion as Exclude<EmotionName, 'neutral'>,
      weight: index + 1,
    })),
  ),
);
const NEGATIONS = new Set(['not', 'no', 'never', 'without', 'neither', 'nor', 'cannot', 'nobody', 'nothing']);
const INTENSIFIERS: Record<string, number> = {
  very: 1.4, really: 1.4, so: 1.3, extremely: 1.6, absolutely: 1.6,
  totally: 1.5, incredibly: 1.6, super: 1.4, quite: 1.2, slightly: 0.6,
  bit: 0.7, somewhat: 0.7, kinda: 0.7, little: 0.7,
};
const EMOTION_COLORS: Record<EmotionName, number> = {
  neutral: 0x4fe3ff,
  feliz: 0x5cffa0,
  triste: 0x4f8cff,
  enfadado: 0xff4a3a,
  sorpresa: 0xffe96a,
  miedo: 0xb27cff,
};

function scoreSentence(sentence: string): EmotionResult {
  const scores: Record<Exclude<EmotionName, 'neutral'>, number> = {
    feliz: 0, triste: 0, enfadado: 0, miedo: 0, sorpresa: 0,
  };
  const tokens = sentence.replace(/[’]/g, "'").match(/[A-Za-z']+/g) ?? [];
  tokens.forEach((token, index) => {
    const lowerToken = token.toLowerCase();
    const match = EMOTION_LEXICON.find((entry) =>
      entry.prefix ? lowerToken.startsWith(entry.word) : lowerToken === entry.word,
    );
    if (!match) {
      return;
    }

    let weight = match.weight;
    let emotion = match.emotion;
    const previous = tokens.slice(Math.max(0, index - 3), index).map((word) => word.toLowerCase());
    const precedingWord = previous[previous.length - 1];
    if (precedingWord && INTENSIFIERS[precedingWord]) {
      weight *= INTENSIFIERS[precedingWord];
    }
    if (token.length > 1 && token === token.toUpperCase()) {
      weight *= 1.3;
    }
    if (previous.some((word) => NEGATIONS.has(word) || word.endsWith("n't"))) {
      if (emotion === 'feliz') {
        emotion = 'triste';
        weight *= 0.6;
      } else if (emotion !== 'sorpresa') {
        weight = 0;
      }
    }
    scores[emotion] += weight;
  });

  const exclamations = (sentence.match(/!/g) ?? []).length;
  if (/:-?\)|:D|;\)/.test(sentence)) {
    scores.feliz += 1.5;
  }
  if (/:-?\(|:'\(/.test(sentence)) {
    scores.triste += 1.5;
  }
  if (/\?!|!\?|[!?]{3,}/.test(sentence)) {
    scores.sorpresa += 1;
  }

  const [emotion, score] = (Object.entries(scores) as [Exclude<EmotionName, 'neutral'>, number][])
    .sort((left, right) => right[1] - left[1])[0];
  if (score < 0.3) {
    return exclamations ? { emotion: 'feliz', intensity: 0.35 } : { emotion: 'neutral', intensity: 0 };
  }
  return {
    emotion,
    intensity: Math.min(1, score * (1 + 0.15 * Math.min(3, exclamations)) / 2.5),
  };
}

function analyzeEmotion(text: string): EmotionResult {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [];
  return sentences
    .map(scoreSentence)
    .reduce<EmotionResult>(
      (strongest, result) => result.intensity > strongest.intensity ? result : strongest,
      { emotion: 'neutral', intensity: 0 },
    );
}

@Component({
  selector: 'app-avatar',
  standalone: true,
  templateUrl: './avatar.component.html',
  styleUrls: ['./avatar.component.scss'],
})
export class AvatarComponent implements AfterViewInit, OnDestroy {
  @Input() talking = false;
  @Input() set emotionText(text: string) {
    const result = analyzeEmotion(text ?? '');
    const neutral = EXPRESSIONS.neutral;
    const detected = EXPRESSIONS[result.emotion];
    const blend = result.intensity === 0 ? 0 : 0.4 + 0.6 * result.intensity;
    for (const key of Object.keys(neutral) as (keyof Expression)[]) {
      this.targetExpression[key] = neutral[key] + (detected[key] - neutral[key]) * blend;
    }
    this.targetEmotion = result.intensity > 0.15 ? result.emotion : 'neutral';
  }
  @ViewChild('canvasHost', { static: true }) canvasHost!: ElementRef<HTMLDivElement>;

  private readonly avatarService = inject(AvatarService);
  private volumeSub?: Subscription;
  private resizeObserver?: ResizeObserver;
  private renderer?: Three.WebGLRenderer;
  private scene?: Three.Scene;
  private camera?: Three.PerspectiveCamera;
  private animationFrame = 0;
  private destroyed = false;
  private currentVolume = 0;
  private glow!: Three.Color;
  private readonly glowMaterials: Three.MeshBasicMaterial[] = [];
  private readonly dimGlowMaterials: Three.MeshBasicMaterial[] = [];
  private readonly expression: Expression = { ...EXPRESSIONS.neutral };
  private targetExpression: Expression = { ...EXPRESSIONS.neutral };
  private targetEmotion: EmotionName = 'neutral';
  private readonly eyes: EyeParts[] = [];
  private readonly cheeks: Three.Mesh[] = [];
  private readonly brows: Array<{ mesh: Three.Mesh; side: number }> = [];
  private head!: Three.Group;
  private antenna!: Three.Group;
  private bulb!: Three.Mesh;
  private mouthInterior!: Three.Mesh;
  private mouthLip!: Three.Mesh;
  private teeth!: Three.BufferGeometry;
  private tongue!: Three.BufferGeometry;
  private mouthInteriorPositions = new Float32Array(0);
  private mouthLipPositions = new Float32Array(0);
  private teethPositions = new Float32Array(0);
  private tonguePositions = new Float32Array(0);
  private lookX = 0;
  private lookY = 0;
  private targetLookX = 0;
  private targetLookY = 0;
  private lastPointerMove = -Infinity;
  private nextSaccade = 0;
  private nextBlink = 0;
  private blinkStarted = -Infinity;
  private readonly onPointerMove = (event: PointerEvent): void => {
    const bounds = this.canvasHost.nativeElement.getBoundingClientRect();
    this.targetLookX = THREE.MathUtils.clamp(
      ((event.clientX - (bounds.left + bounds.width / 2)) / (window.innerWidth * 0.45)),
      -1,
      1,
    );
    this.targetLookY = THREE.MathUtils.clamp(
      -((event.clientY - (bounds.top + bounds.height / 2)) / (window.innerHeight * 0.45)),
      -1,
      1,
    );
    this.lastPointerMove = performance.now();
  };
  ngAfterViewInit(): void {
    this.volumeSub = this.avatarService.volume$.subscribe((volume) => {
      this.currentVolume = volume;
    });

    void import('three')
      .then((three) => {
        if (this.destroyed) {
          return;
        }
        THREE = three;
        this.initializeAvatar();
      })
      .catch((error: unknown) => this.handleInitializationError(error));
  }

  private initializeAvatar(): void {
    try {
      this.createScene();
      window.addEventListener('pointermove', this.onPointerMove);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvasHost.nativeElement);
      this.resize();
      this.animationFrame = requestAnimationFrame(this.animate);
    } catch (error) {
      this.handleInitializationError(error);
    }
  }

  private handleInitializationError(error: unknown): void {
    if (this.destroyed) {
      return;
    }
    console.error('Unable to initialize the 3D avatar.', error);
    this.canvasHost.nativeElement.textContent = '3D avatar unavailable';
    this.canvasHost.nativeElement.classList.add('avatar-unavailable');
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.volumeSub?.unsubscribe();
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('pointermove', this.onPointerMove);

    this.scene?.traverse((object) => {
      if (THREE && object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }

  private createScene(): void {
    this.glow = new THREE.Color(0x4fe3ff);
    const host = this.canvasHost.nativeElement;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.camera.position.set(0, 0.2, 6.3);
    this.camera.lookAt(0, 0.12, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7766, 0.85));
    const sunlight = new THREE.DirectionalLight(0xffffff, 0.75);
    sunlight.position.set(2, 3, 4);
    scene.add(sunlight);

    this.createCharacter(scene);
  }

  private createCharacter(scene: Three.Scene): void {
    const makeMaterial = (color: number, roughness = 0.6): Three.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color, roughness });
    const skin = new THREE.MeshPhongMaterial({
      color: 0xeef2f6,
      shininess: 140,
      specular: 0x555555,
    });
    const plateMaterial = new THREE.MeshPhongMaterial({
      color: 0x0e1b27,
      shininess: 40,
      specular: 0x667788,
    });

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.9, 24), makeMaterial(0x8a96a3, 0.4));
    neck.position.y = -1.2;
    scene.add(neck);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, 1, 32), makeMaterial(0xe6ebf0, 0.35));
    torso.position.y = -1.85;
    scene.add(torso);

    this.head = new THREE.Group();
    scene.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 36), skin);
    skull.scale.set(1, 1.12, 1.02);
    this.head.add(skull);
    const faceplate = new THREE.Mesh(
      new THREE.SphereGeometry(1, 56, 36, Math.PI / 2 - 1.05, 2.1, 0.8, 1.7),
      plateMaterial,
    );
    faceplate.scale.set(1.006, 1.12 * 1.006, 1.02 * 1.006);
    this.head.add(faceplate);

    const createGlowMaterial = (dim = false): Three.MeshBasicMaterial => {
      const material = new THREE.MeshBasicMaterial({
        color: this.glow.clone().multiplyScalar(dim ? 0.55 : 1),
        side: THREE.DoubleSide,
      });
      (dim ? this.dimGlowMaterials : this.glowMaterials).push(material);
      return material;
    };
    const brightGlow = createGlowMaterial();

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 28).rotateZ(Math.PI / 2), skin);
      ear.position.set(side * 1.02, 0, 0.02);
      this.head.add(ear);
      const earRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 28).rotateY(Math.PI / 2), brightGlow);
      earRing.position.set(side * 1.11, 0, 0.02);
      this.head.add(earRing);
    }

    this.antenna = new THREE.Group();
    this.antenna.position.y = 1.1;
    this.head.add(this.antenna);
    const antennaStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.28, 12), makeMaterial(0x8a96a3, 0.4));
    antennaStem.position.y = 0.12;
    this.antenna.add(antennaStem);
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), brightGlow);
    this.bulb.position.y = 0.3;
    this.antenna.add(this.bulb);

    for (const side of [-1, 1]) {
      const cheekMaterial = new THREE.MeshBasicMaterial({
        color: 0xe9737d,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), cheekMaterial);
      cheek.scale.set(1, 0.8, 0.25);
      cheek.position.set(side * 0.55, -0.22, this.surfaceZ(0.55, -0.22) + 0.025);
      cheek.rotation.y = side * 0.6;
      this.head.add(cheek);
      this.cheeks.push(cheek);
    }

    this.createEyes(plateMaterial, makeMaterial, createGlowMaterial);
    this.createBrows(brightGlow);
    this.createMouth(createGlowMaterial);
  }

  private createEyes(
    plateMaterial: Three.MeshPhongMaterial,
    makeMaterial: (color: number, roughness?: number) => Three.MeshStandardMaterial,
    createGlowMaterial: (dim?: boolean) => Three.MeshBasicMaterial,
  ): void {
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.37, 0.12, 0.78);
      eye.scale.setScalar(1.3);
      this.head.add(eye);
      const ball = new THREE.Group();
      eye.add(ball);
      ball.add(new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 28, 20),
        new THREE.MeshPhongMaterial({ color: 0x06121b, shininess: 150, specular: 0xffffff }),
      ));
      ball.add(new THREE.Mesh(
        new THREE.SphereGeometry(0.181, 28, 14, 0, Math.PI * 2, 0, 0.82).rotateX(Math.PI / 2),
        createGlowMaterial(true),
      ));
      ball.add(new THREE.Mesh(
        new THREE.SphereGeometry(0.1815, 28, 14, 0, Math.PI * 2, 0, 0.62).rotateX(Math.PI / 2),
        createGlowMaterial(),
      ));
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.182, 20, 12, 0, Math.PI * 2, 0, 0.3).rotateX(Math.PI / 2),
        makeMaterial(0x050505, 0.2),
      );
      ball.add(pupil);
      const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const highlight = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), highlightMaterial);
      highlight.position.set(0.06, 0.07, 0.163);
      const smallHighlight = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), highlightMaterial);
      smallHighlight.position.set(-0.05, -0.05, 0.172);
      ball.add(highlight, smallHighlight);

      const lidGeometry = (): Three.SphereGeometry =>
        new THREE.SphereGeometry(0.195, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
      const upperLid = new THREE.Mesh(lidGeometry(), plateMaterial);
      const lowerLid = new THREE.Mesh(lidGeometry(), plateMaterial);
      eye.add(upperLid, lowerLid);
      const lash = new THREE.Mesh(new THREE.TorusGeometry(0.195, 0.014, 8, 28, Math.PI), createGlowMaterial());
      lash.rotation.z = Math.PI;
      upperLid.add(lash);
      this.eyes.push({ ball, upperLid, lowerLid, pupil, side });
    }
  }

  private createBrows(glowMaterial: Three.MeshBasicMaterial): void {
    for (const side of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.36, 12).rotateZ(Math.PI / 2), glowMaterial);
      this.head.add(brow);
      this.brows.push({ mesh: brow, side });
    }
  }

  private createMouth(createGlowMaterial: (dim?: boolean) => Three.MeshBasicMaterial): void {
    const segments = 28;
    const stripSegments = 17;
    this.mouthInteriorPositions = new Float32Array((segments + 1) * 3);
    this.mouthLipPositions = new Float32Array(segments * 2 * 3);
    this.teethPositions = new Float32Array(stripSegments * 2 * 3);
    this.tonguePositions = new Float32Array(stripSegments * 2 * 3);

    const interiorGeometry = new THREE.BufferGeometry();
    interiorGeometry.setAttribute('position', new THREE.BufferAttribute(this.mouthInteriorPositions, 3));
    const interiorIndices: number[] = [];
    for (let index = 0; index < segments; index++) {
      interiorIndices.push(0, index + 1, ((index + 1) % segments) + 1);
    }
    interiorGeometry.setIndex(interiorIndices);

    const lipGeometry = new THREE.BufferGeometry();
    lipGeometry.setAttribute('position', new THREE.BufferAttribute(this.mouthLipPositions, 3));
    const lipIndices: number[] = [];
    for (let index = 0; index < segments; index++) {
      const current = 2 * index;
      const next = 2 * ((index + 1) % segments);
      lipIndices.push(current, current + 1, next, current + 1, next + 1, next);
    }
    lipGeometry.setIndex(lipIndices);

    this.mouthInterior = new THREE.Mesh(
      interiorGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x03080d,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    this.mouthLip = new THREE.Mesh(
      lipGeometry,
      Object.assign(createGlowMaterial(), { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.mouthInterior.frustumCulled = false;
    this.mouthLip.frustumCulled = false;
    this.head.add(this.mouthInterior, this.mouthLip);

    const stripIndices: number[] = [];
    for (let index = 0; index < stripSegments - 1; index++) {
      const current = 2 * index;
      stripIndices.push(current, current + 1, current + 2, current + 1, current + 3, current + 2);
    }
    this.teeth = this.createStrip(this.teethPositions, 0xdff8ff, -1.5, stripIndices);
    this.tongue = this.createStrip(this.tonguePositions, 0x0f2a3a, -1.2, stripIndices);
    this.updateMouth(0, 0.4, 0.12);
  }

  private createStrip(
    positions: Float32Array,
    color: number,
    offset: number,
    indices: number[],
  ): Three.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: offset,
        polygonOffsetUnits: offset,
      }),
    );
    mesh.frustumCulled = false;
    this.head.add(mesh);
    return geometry;
  }

  private surfaceZ(x: number, y: number): number {
    return 1.02 * Math.sqrt(Math.max(0, 1 - x * x - (y / 1.12) ** 2));
  }

  private updateMouth(open: number, width: number, smile: number): void {
    const segments = 28;
    const stripSegments = 17;
    const centerY = -0.5;
    const halfWidth = 0.13 + 0.17 * width + Math.max(0, smile) * 0.09;
    const opening = open * 0.3;
    const upper = opening * 0.35;
    const lower = opening * 0.65;
    const center = centerY + smile * 0.04 + (upper - lower) * 0.15;
    this.mouthInteriorPositions.set([0, center, this.surfaceZ(0, center) + 0.012], 0);
    const thickness = 0.045 + 0.015 * (1 - open);

    for (let index = 0; index < segments; index++) {
      const angle = (index / segments) * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const x = halfWidth * cosine;
      const y = centerY + (sine > 0 ? upper : lower) * sine + smile * 0.15 * cosine * cosine;
      this.mouthInteriorPositions.set([x, y, this.surfaceZ(x, y) + 0.012], (index + 1) * 3);
      const outerX = x + cosine * thickness * 1.3;
      const outerY = y + sine * thickness;
      this.mouthLipPositions.set(
        [x, y, this.surfaceZ(x, y) + 0.02, outerX, outerY, this.surfaceZ(outerX, outerY) + 0.02],
        index * 6,
      );
    }

    for (let index = 0; index < stripSegments; index++) {
      const t = -1 + (2 * index) / (stripSegments - 1);
      const curve = Math.sqrt(Math.max(0, 1 - t * t));
      const x = halfWidth * t;
      const smileCurve = smile * 0.15 * t * t;
      const top = centerY + upper * curve + smileCurve;
      const bottom = centerY - lower * curve + smileCurve;
      const toothBottom = Math.max(bottom, top - Math.min(0.065, (upper + lower) * 0.5));
      this.teethPositions.set(
        [x, top, this.surfaceZ(x, top) + 0.016, x, toothBottom, this.surfaceZ(x, toothBottom) + 0.016],
        index * 6,
      );
      const tongueTop = bottom + lower * 0.8 * (1 - t * t);
      this.tonguePositions.set(
        [x, bottom, this.surfaceZ(x, bottom) + 0.014, x, tongueTop, this.surfaceZ(x, tongueTop) + 0.014],
        index * 6,
      );
    }

    this.mouthInterior.geometry.attributes['position'].needsUpdate = true;
    this.mouthLip.geometry.attributes['position'].needsUpdate = true;
    this.teeth.attributes['position'].needsUpdate = true;
    this.tongue.attributes['position'].needsUpdate = true;
  }

  private resize(): void {
    if (!this.renderer || !this.camera) {
      return;
    }
    const { clientWidth, clientHeight } = this.canvasHost.nativeElement;
    if (clientWidth === 0 || clientHeight === 0) {
      return;
    }
    this.renderer.setSize(clientWidth, clientHeight);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  private readonly animate = (time: number): void => {
    if (!this.renderer || !this.scene || !this.camera) {
      return;
    }

    if (time >= this.nextBlink) {
      this.blinkStarted = time;
      this.nextBlink = time + 2200 + Math.random() * 3500;
    }
    const blink = Math.max(0, 1 - Math.abs((time - this.blinkStarted - 100) / 100));
    if (time - this.lastPointerMove > 3000 && time >= this.nextSaccade) {
      this.targetLookX = (Math.random() - 0.5) * 0.8;
      this.targetLookY = (Math.random() - 0.5) * 0.4;
      this.nextSaccade = time + 1500 + Math.random() * 2500;
    }
    this.lookX += (this.targetLookX - this.lookX) * 0.12;
    this.lookY += (this.targetLookY - this.lookY) * 0.12;

    const volume = this.talking ? THREE.MathUtils.clamp(this.currentVolume, 0, 1) : 0;
    for (const key of Object.keys(this.expression) as (keyof Expression)[]) {
      this.expression[key] += (this.targetExpression[key] - this.expression[key]) * 0.07;
    }
    const opening = Math.max(
      Math.pow(volume, 0.6),
      this.expression.mouthOpen * (this.talking ? 0.5 : 1),
    );
    this.updateMouth(opening, 0.4, this.expression.smile);

    const lowerLidUp = THREE.MathUtils.clamp(
      this.expression.cheek * 0.45
        + Math.max(0, this.expression.tilt) * 0.4
        + Math.max(0, -this.expression.smile) * 0.15,
      0,
      1,
    );
    const pupilScale = THREE.MathUtils.clamp(
      1 + 0.35 * Math.max(0, this.expression.brow)
        + 0.2 * this.expression.cheek
        - 0.3 * Math.max(0, this.expression.tilt),
      0.6,
      1.5,
    );
    for (const eye of this.eyes) {
      const eyeOpen = THREE.MathUtils.clamp(
        this.expression.eye * (1 - this.expression.cheek * 0.2),
        0,
        1,
      ) * (1 - blink);
      eye.upperLid.rotation.x = -(eyeOpen * 2.5) - this.lookY * 0.3;
      eye.lowerLid.rotation.x = 2.4 - lowerLidUp * 0.6;
      eye.ball.rotation.y = this.lookX * 0.5;
      eye.ball.rotation.x = -this.lookY * 0.35;
      eye.pupil.scale.set(pupilScale, pupilScale, 1);
    }
    for (const cheek of this.cheeks) {
      (cheek.material as Three.MeshBasicMaterial).opacity = this.expression.cheek * 0.45;
    }
    for (const brow of this.brows) {
      const x = brow.side * 0.36;
      const y = 0.42 + this.expression.brow * 0.11 - Math.abs(this.expression.tilt) * 0.01;
      brow.mesh.position.set(x, y, this.surfaceZ(x, y) + 0.03);
      brow.mesh.rotation.set(0, brow.side * 0.38, brow.side * this.expression.tilt * 0.4);
    }

    const idleSway = Math.sin(time / 1300) * 0.04;
    this.head.rotation.y = this.lookX * 0.3 + idleSway;
    this.head.rotation.x = -this.lookY * 0.15
      + (volume > 0 ? Math.sin(time / 190) * 0.04 * opening : 0)
      + (this.expression.tilt < -0.3 ? 0.08 : 0);
    this.head.rotation.z = Math.sin(time / 2100) * 0.025 + this.expression.smile * 0.02;
    this.antenna.rotation.z = Math.sin(time / 320) * (0.04 + opening * 0.25);
    this.antenna.rotation.x = Math.sin(time / 410) * (0.03 + opening * 0.15);
    this.bulb.scale.setScalar(1 + 0.15 * Math.sin(time / 300) + opening * 0.3);

    this.glow.lerp(new THREE.Color(EMOTION_COLORS[this.targetEmotion]), 0.08);
    this.glowMaterials.forEach((material) => material.color.copy(this.glow));
    this.dimGlowMaterials.forEach((material) => material.color.copy(this.glow).multiplyScalar(0.55));
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.animate);
  };
}
