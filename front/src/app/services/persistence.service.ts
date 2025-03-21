import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PersistenceService {
  public user: string=''
  public password: string=''
  labelContext=""  
  uuid:string = '';

  constructor() {
    this.uuid = this.generateUuid();
   }
  setUuid(uuid: string) {
    this.uuid = uuid;
  }

  getUuid(): string {
    return this.uuid;
  }
  private generateUuid(): string {
    // Generate a random UUID (version 4)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
