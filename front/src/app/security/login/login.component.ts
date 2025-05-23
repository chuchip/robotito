import { Component } from '@angular/core';
import { PersistenceService } from '../../services/persistence.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiBackService } from '../../services/api-back.service';
@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  userName:string=""
  password:string=""
  error_login=""
  init=false
  constructor(public router: Router,public persistence: PersistenceService,public back: ApiBackService ) {
    this.back.clearConversation().then(async () => {      
      if (persistence.clearLogin)
      {
        this.init=true
        return;    
      }
      const cookie= this.persistence.getCookie("robotito-uuid");
      console.log("Cookie: ",cookie)
      if (cookie!='')
      {
        const valor = await this.back.getLoginUser(cookie) 
        if (valor.status=='OK')
        {
          this.persistence.setUser(valor.session.user)
          this.persistence.setAuthorization(valor.session.authorization)
          this.router.navigate(['/conversation']);
        }
        this.init=true
        console.log(valor) 
      }
      this.init=true

    }
   )      
  }

  async onSubmit() {
    if (this.userName!='' && this.password!='' && this.init) 
    {
      const valor= await this.back.loginUser(this.userName,this.password)
      console.log(`Valor login user`,valor)
      if (valor['status'] != 'OK' )
      {
        this.error_login=valor['error']
        return;
      }
      console.log(`Valor login user`,valor)
      this.persistence.setUser(this.userName)
      this.persistence.setAuthorization(valor['session']['authorization'])
      this.persistence.setCookie({
        name: "robotito-uuid",
        value: valor['session']['authorization']
      });
      this.router.navigate(['/conversation']); 
    }
  }
}
