import { Component, Input, OnDestroy, ElementRef, ViewChild, AfterViewInit, inject } from "@angular/core";
import { Subscription } from "rxjs";
import { AvatarService } from "../services/avatar.service";

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

  private avatarService = inject(AvatarService);
  private volumeSub!: Subscription;
  private currentVolume = 0;

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

  private readonly mouthRestOY = 740;
  private readonly mouthRestIY = 715;
  // Volume-driven range: min/max for outer and inner Y
  private readonly outerYRange: [number, number] = [740, 800]; // closed → wide open
  private readonly innerYRange: [number, number] = [715, 760];

  ngAfterViewInit(): void {
    this.volumeSub = this.avatarService.volume$.subscribe((v: number) => this.currentVolume = v);
    this.startMouthAnimation();
    this.startEyeAnimation();
    this.startBlinkAnimation();
    this.startHeadAnimation();
  }

  ngOnDestroy(): void {
    this.volumeSub?.unsubscribe();
    cancelAnimationFrame(this.mouthAnimFrame);
    clearInterval(this.eyeInterval);
    clearInterval(this.blinkInterval);
    clearInterval(this.headInterval);
    cancelAnimationFrame(this.headAnimFrame);
  }

  private startMouthAnimation(): void {
    const animate = () => {
      // Determine target mouth opening from volume when talking
      let targetOY: number;
      let targetIY: number;

      if (this.talking && this.currentVolume > 0.01) {
        // Map volume (0–1) to mouth opening with an exponent curve for more natural feel
        const v = Math.pow(this.currentVolume, 0.6); // boost low volumes
        targetOY = this.outerYRange[0] + (this.outerYRange[1] - this.outerYRange[0]) * v;
        targetIY = this.innerYRange[0] + (this.innerYRange[1] - this.innerYRange[0]) * v * 0.85;
      } else {
        targetOY = this.mouthRestOY;
        targetIY = this.mouthRestIY;
      }

      // Smooth interpolation — open faster than close for snappy articulation
      const easeOpen = 0.25;
      const easeClose = 0.10;
      const easeOY = targetOY > this.curOY ? easeOpen : easeClose;
      const easeIY = targetIY > this.curIY ? easeOpen : easeClose;

      this.curOY += (targetOY - this.curOY) * easeOY;
      this.curIY += (targetIY - this.curIY) * easeIY;

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
