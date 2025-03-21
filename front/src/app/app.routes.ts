import { Routes } from '@angular/router';
import { ConversationComponent } from './conversation/conversation.component'
import { LoginComponent } from './security/login/login.component'
import { AppComponent } from './app.component';
export const routes: Routes = [          

    { path: '',  component: AppComponent },    
    { path: 'login', component: LoginComponent },
    { path: 'conversation', component: ConversationComponent },
];
