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
  @ViewChild('mouthOuter') mouthOuter!: ElementRef<SVGEllipseElement>;
  @ViewChild('mouthInner') mouthInner!: ElementRef<SVGEllipseElement>;

  private mouthInterval: any;
  private eyeInterval: any;
  private blinkInterval: any;

  private readonly eyeLX = 282;
  private readonly eyeLY = 540;
  private readonly eyeRX = 525;
  private readonly eyeRY = 540;

  private curORx = 50;
  private curORy = 4;
  private curIRx = 40;
  private curIRy = 2;

  private readonly mouthRest = [50, 4, 40, 2];
  private readonly mouthShapes = [
    [30, 18, 22, 12],
    [38, 28, 30, 20],
    [32, 35, 24, 27],
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
      let tORx: number, tORy: number, tIRx: number, tIRy: number;
      if (this.talking) {
        const m = this.mouthShapes[Math.floor(Math.random() * this.mouthShapes.length)];
        tORx = m[0]; tORy = m[1]; tIRx = m[2]; tIRy = m[3];
      } else {
        tORx = this.mouthRest[0]; tORy = this.mouthRest[1];
        tIRx = this.mouthRest[2]; tIRy = this.mouthRest[3];
      }
      this.curORx += (tORx - this.curORx) * 0.3;
      this.curORy += (tORy - this.curORy) * 0.3;
      this.curIRx += (tIRx - this.curIRx) * 0.3;
      this.curIRy += (tIRy - this.curIRy) * 0.3;

      const outer = this.mouthOuter.nativeElement;
      const inner = this.mouthInner.nativeElement;
      outer.setAttribute('rx', String(this.curORx));
      outer.setAttribute('ry', String(this.curORy));
      inner.setAttribute('rx', String(this.curIRx));
      inner.setAttribute('ry', String(this.curIRy));
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
