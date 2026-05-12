import { Component, Input, OnDestroy, ElementRef, ViewChild, AfterViewInit } from "@angular/core";

@Component({
  selector: 'app-avatar',
  standalone: true,
  templateUrl: './avatar.component.html',
  styleUrls: ['./avatar.component.scss'],
})
export class AvatarComponent implements AfterViewInit, OnDestroy {
  @Input() talking = false;

  @ViewChild('irisL') irisL!: ElementRef<SVGEllipseElement>;
  @ViewChild('irisR') irisR!: ElementRef<SVGEllipseElement>;
  @ViewChild('pupilL') pupilL!: ElementRef<SVGEllipseElement>;
  @ViewChild('pupilR') pupilR!: ElementRef<SVGEllipseElement>;
  @ViewChild('lidL') lidL!: ElementRef<SVGEllipseElement>;
  @ViewChild('lidR') lidR!: ElementRef<SVGEllipseElement>;
  @ViewChild('mouthOuter') mouthOuter!: ElementRef<SVGPathElement>;
  @ViewChild('mouthInner') mouthInner!: ElementRef<SVGPathElement>;
  @ViewChild('headGroup') headGroup!: ElementRef<SVGGElement>;

  private mouthAnimFrame: any;
  private eyeInterval: any;
  private blinkInterval: any;
  private headInterval: any;
  private headAnimFrame: any;

  // Head movement state
  private headRotation = 0;
  private headTiltX = 0;
  private headTiltY = 0;
  private targetRotation = 0;
  private targetTiltX = 0;
  private targetTiltY = 0;

  private readonly eyeLX = 282;
  private readonly eyeLY = 540;
  private readonly eyeRX = 525;
  private readonly eyeRY = 540;

  // Mouth animation state
  private curOY = 740;
  private curIY = 715;
  private targetOY = 740;
  private targetIY = 715;
  private mouthEase = 0.08;
  private nextMouthChangeTime = 0;

  // Wider variety of mouth shapes: [outerY, innerY, easing, holdMs]
  // outerY > 740 = open, < 740 = pursed; innerY controls tongue/inner mouth
  private readonly mouthRest: [number, number] = [740, 715];
  private readonly mouthShapes: [number, number, number, number][] = [
    [720, 726, 0.10, 80],   // slightly open, quick
    [735, 730, 0.08, 120],  // barely open
    [755, 740, 0.06, 150],  // medium open
    [785, 750, 0.05, 180],  // wide open
    [765, 677, 0.07, 100],  // open with inner low
    [745, 670, 0.09, 90],   // small open, inner low
    [730, 720, 0.12, 60],   // near closed, fast
    [770, 745, 0.06, 140],  // medium-wide
    [740, 715, 0.10, 200],  // brief rest between words
  ];

  ngAfterViewInit(): void {
    this.startMouthAnimation();
    this.startEyeAnimation();
    this.startBlinkAnimation();
    this.startHeadAnimation();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.mouthAnimFrame);
    clearInterval(this.eyeInterval);
    clearInterval(this.blinkInterval);
    clearInterval(this.headInterval);
    cancelAnimationFrame(this.headAnimFrame);
  }

  private startMouthAnimation(): void {
    const animate = (time: number) => {
      if (this.talking) {
        // Time to pick a new mouth shape?
        if (time >= this.nextMouthChangeTime) {
          const shape = this.mouthShapes[Math.floor(Math.random() * this.mouthShapes.length)];
          // Add slight random variation for organic feel
          this.targetOY = shape[0] + (Math.random() - 0.5) * 10;
          this.targetIY = shape[1] + (Math.random() - 0.5) * 8;
          this.mouthEase = shape[2];
          this.nextMouthChangeTime = time + shape[3] + Math.random() * 80;
        }
      } else {
        // Ease back to rest
        this.targetOY = this.mouthRest[0];
        this.targetIY = this.mouthRest[1];
        this.mouthEase = 0.06;
      }

      // Smooth interpolation toward target
      this.curOY += (this.targetOY - this.curOY) * this.mouthEase;
      this.curIY += (this.targetIY - this.curIY) * this.mouthEase;

      const outer = this.mouthOuter.nativeElement;
      const inner = this.mouthInner.nativeElement;

      // Outer mouth path
      outer.setAttribute('d', `M 340 690 Q 390 ${this.curOY.toFixed(1)} 440 690`);
      outer.setAttribute('fill', this.curOY > 730 ? 'rgb(25,47,72)' : 'none');

      // Inner mouth path
      inner.setAttribute('d', `M 345 691 Q 390 ${this.curIY.toFixed(1)} 435 691`);
      inner.setAttribute('fill', this.curIY > 725 ? 'rgb(139,0,0)' : 'none');

      this.mouthAnimFrame = requestAnimationFrame(animate);
    };
    this.mouthAnimFrame = requestAnimationFrame(animate);
  }

  private startEyeAnimation(): void {
    this.eyeInterval = setInterval(() => {
      const lx = (Math.random() - 0.5) * 14;
      const ly = (Math.random() - 0.5) * 10;

      this.irisL.nativeElement.setAttribute('cx', String(this.eyeLX + lx));
      this.irisL.nativeElement.setAttribute('cy', String(this.eyeLY + ly));
      this.pupilL.nativeElement.setAttribute('cx', String(this.eyeLX + lx));
      this.pupilL.nativeElement.setAttribute('cy', String(this.eyeLY + ly));
      this.irisR.nativeElement.setAttribute('cx', String(this.eyeRX + lx));
      this.irisR.nativeElement.setAttribute('cy', String(this.eyeRY + ly));
      this.pupilR.nativeElement.setAttribute('cx', String(this.eyeRX + lx));
      this.pupilR.nativeElement.setAttribute('cy', String(this.eyeRY + ly));
    }, 2000);
  }

  private startBlinkAnimation(): void {
    this.blinkInterval = setInterval(() => {
      this.lidL.nativeElement.setAttribute('ry', '40');
      this.lidR.nativeElement.setAttribute('ry', '40');
      setTimeout(() => {
        this.lidL.nativeElement.setAttribute('ry', '0');
        this.lidR.nativeElement.setAttribute('ry', '0');
      }, 150);
    }, 3500);
  }

  private startHeadAnimation(): void {
    // Pick new random head targets every 1.5–3 seconds
    const pickNewTarget = () => {
      this.targetRotation = (Math.random() - 0.5) * 8;  // ±4 degrees rotation
      this.targetTiltX = (Math.random() - 0.5) * 12;    // ±6px horizontal
      this.targetTiltY = (Math.random() - 0.5) * 8;     // ±4px vertical
    };
    pickNewTarget();

    this.headInterval = setInterval(() => {
      pickNewTarget();
    }, 1500 + Math.random() * 1500);

    // Smooth interpolation every frame
    const animate = () => {
      const ease = 0.06;
      this.headRotation += (this.targetRotation - this.headRotation) * ease;
      this.headTiltX += (this.targetTiltX - this.headTiltX) * ease;
      this.headTiltY += (this.targetTiltY - this.headTiltY) * ease;

      const cx = 418; // approximate center X of the SVG head
      const cy = 600; // approximate center Y of the SVG head
      this.headGroup.nativeElement.setAttribute(
        'transform',
        `translate(${this.headTiltX}, ${this.headTiltY}) rotate(${this.headRotation}, ${cx}, ${cy})`
      );

      this.headAnimFrame = requestAnimationFrame(animate);
    };
    this.headAnimFrame = requestAnimationFrame(animate);
  }
}
