import { Routes } from '@angular/router';
import { ConversationComponent } from './conversation/conversation.component'
import { LoginComponent } from './security/login/login.component'
import { NotesPageComponent } from './notes/notes-page.component'
import { DictionaryPageComponent } from './dictionary/dictionary-page.component'
import { ReviewPageComponent } from './review/review-page.component'
import { MemoryPageComponent } from './memory/memory-page.component'

export const routes: Routes = [          
    { path: '', component: ConversationComponent },    
    { path: 'conversation', component: ConversationComponent },
    { path: 'notes/:id', component: NotesPageComponent },
    { path: 'dictionary/:id', component: DictionaryPageComponent },
    { path: 'review', component: ReviewPageComponent },
    { path: 'memory', component: MemoryPageComponent },
    { path: '**', component: LoginComponent },
];
