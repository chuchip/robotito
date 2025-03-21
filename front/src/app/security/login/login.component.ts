import { Component } from '@angular/core';
import { PersistenceService } from '../../services/persistence.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  userName:string=""
  password:string=""
  constructor(public router: Router,public persistence: PersistenceService) {
  }

  onSubmit() {
    if (this.userName!='' && this.password!='') 
    {
      this.persistence.user=this.userName
      this.persistence.password=this.password
      this.router.navigate(['/conversation']); 
    }
  }
}
