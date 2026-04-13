import { Routes } from '@angular/router';
import { ConversationComponent } from './conversation/conversation.component'
import { LoginComponent } from './security/login/login.component'
import { NotesPageComponent } from './notes/notes-page.component'

export const routes: Routes = [          
    { path: '', component: ConversationComponent },    
    { path: 'conversation', component: ConversationComponent },
    { path: 'notes/:id', component: NotesPageComponent },
    { path: '**', component: LoginComponent },
];
