import { Component, Input } from "@angular/core";

@Component({
  selector: 'app-avatar',
  standalone: true,
  templateUrl: './avatar.component.html',
  styleUrls: ['./avatar.component.scss'],
})
export class AvatarComponent {
  /**
   * When `talking` is true the avatar will add a CSS class that animates
   * the mouth to simulate speaking.
   */
  @Input() talking = false;
}
