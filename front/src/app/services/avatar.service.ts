import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AvatarService {
  private talkingSubject = new BehaviorSubject<boolean>(false);
  /** Observable that components can subscribe to in order to know whether the avatar should be "talking" */
  public readonly talking$ = this.talkingSubject.asObservable();

  /** Tell the avatar to start/stop talking. */
  setTalking(value: boolean) {
    this.talkingSubject.next(value);
  }
}
