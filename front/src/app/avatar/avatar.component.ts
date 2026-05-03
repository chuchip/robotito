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

  private mouthInterval: any;
  private eyeInterval: any;
  private blinkInterval: any;

  private readonly eyeLX = 282;
  private readonly eyeLY = 540;
  private readonly eyeRX = 525;
  private readonly eyeRY = 540;

  // Mouth Q-curve control-point Y values: [outerY, innerY]
  private curOY = 712;
  private curIY = 708;

  private readonly mouthRest: [number, number] = [712, 708];
  private readonly mouthShapes: [number, number][] = [
    [735, 730],
    [750, 745],
    [765, 758],
  ];

  ngAfterViewInit(): void {
    this.startMouthAnimation();
    this.startEyeAnimation();
    this.startBlinkAnimation();
  }

  ngOnDestroy(): void {
    clearInterval(this.mouthInterval);
    clearInterval(this.eyeInterval);
    clearInterval(this.blinkInterval);
  }

  private startMouthAnimation(): void {
    this.mouthInterval = setInterval(() => {
      let tOY: number, tIY: number;
      if (this.talking) {
        const m = this.mouthShapes[Math.floor(Math.random() * this.mouthShapes.length)];
        tOY = m[0]; tIY = m[1];
      } else {
        tOY = this.mouthRest[0]; tIY = this.mouthRest[1];
      }
      this.curOY += (tOY - this.curOY) * 0.3;
      this.curIY += (tIY - this.curIY) * 0.3;

      const outer = this.mouthOuter.nativeElement;
      const inner = this.mouthInner.nativeElement;

      // Outer mouth path
      outer.setAttribute('d', `M 340 690 Q 390 ${this.curOY} 440 690`);
      outer.setAttribute('fill', this.curOY > 725 ? 'rgb(25,47,72)' : 'none');

      // Inner mouth path
      inner.setAttribute('d', `M 345 692 Q 390 ${this.curIY} 435 692`);
      inner.setAttribute('fill', this.curIY > 720 ? '#0086B6' : 'none');
    }, 100);
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
}
