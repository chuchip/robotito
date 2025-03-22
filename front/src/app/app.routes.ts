import { Routes } from '@angular/router';
import { ConversationComponent } from './conversation/conversation.component'
import { LoginComponent } from './security/login/login.component'

export const routes: Routes = [          
    { path: '', component: ConversationComponent },
    { path: 'login', component: LoginComponent },
    { path: 'conversation', component: ConversationComponent },
];
